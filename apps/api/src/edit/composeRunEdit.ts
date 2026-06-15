import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApiGenerationResult } from "@tinker/generation-contract";
import { indexArtifacts } from "../jobs/artifactIndex.js";
import type { RunEdit } from "../workers/editWorker.js";
import { applySearchReplace, parseSearchReplaceBlocks } from "./searchReplace.js";
import { lintComposition } from "./compositionLint.js";
import { buildEditPrompt } from "./buildEditPrompt.js";

/** Runs the edit agent for `prompt`, returning its raw text output (search/replace blocks). */
export type RunAgent = (prompt: string, options: { logDir: string }) => Promise<string>;

async function listFiles(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // skip agent log dotfiles (.tinker-opencode-*) so they aren't indexed as artifacts
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full, root)));
    else out.push(full);
  }
  return out;
}

export function createComposeRunEdit(deps: { runAgent: RunAgent }): RunEdit {
  return async (record, edit): Promise<ApiGenerationResult> => {
    const currentDir = record.currentRevisionId
      ? join(record.outputRoot, "revisions", record.currentRevisionId, "hyperframes")
      : join(record.outputRoot, "hyperframes");
    const revDir = join(record.outputRoot, "revisions", edit.revId, "hyperframes");
    await mkdir(revDir, { recursive: true });
    await cp(currentDir, revDir, { recursive: true });

    const indexPath = join(revDir, "index.html");
    const indexHtml = await readFile(indexPath, "utf8");

    const prompt = buildEditPrompt({ instruction: edit.instruction, context: edit.context, indexHtml });
    const agentText = await deps.runAgent(prompt, { logDir: revDir });

    const blocks = parseSearchReplaceBlocks(agentText);
    if (blocks.length === 0) throw new Error("The edit agent returned no search/replace blocks");
    const applied = applySearchReplace(indexHtml, blocks);
    if (!applied.ok) throw new Error(applied.error);
    const lint = lintComposition(applied.result);
    if (!lint.ok) throw new Error(`Edit failed validation: ${lint.issues.join("; ")}`);

    await writeFile(indexPath, applied.result, "utf8");
    const files = await listFiles(revDir);
    return { artifacts: indexArtifacts({ jobId: record.id, outputRoot: record.outputRoot, artifactPaths: files }) };
  };
}
