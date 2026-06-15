import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

    // The copied composition carries the base/previous render OUTPUTS (output.mp4 + render/lint logs).
    // Drop them so this revision has NO stale output-video: the edit only changes the composition
    // source, so Export must render the EDITED composition fresh on demand rather than download the
    // un-edited video. A real render-on-demand later regenerates these files.
    await Promise.all(
      ["output.mp4", "render.log", "lint.log"].map((name) => rm(join(revDir, name), { force: true })),
    );

    const indexPath = join(revDir, "index.html");
    const indexHtml = await readFile(indexPath, "utf8");

    const prompt = buildEditPrompt({ instruction: edit.instruction, context: edit.context, indexHtml });

    function attempt(html: string, text: string): { ok: true; result: string } | { ok: false; error: string } {
      const blocks = parseSearchReplaceBlocks(text);
      if (blocks.length === 0) return { ok: false, error: "The edit agent returned no search/replace blocks" };
      const applied = applySearchReplace(html, blocks);
      if (!applied.ok) return { ok: false, error: applied.error };
      const lint = lintComposition(applied.result);
      if (!lint.ok) return { ok: false, error: `Edit failed validation: ${lint.issues.join("; ")}` };
      return { ok: true, result: applied.result };
    }

    let agentText = await deps.runAgent(prompt, { logDir: revDir });
    let outcome = attempt(indexHtml, agentText);
    if (!outcome.ok) {
      const retryPrompt = `${prompt}\n\nYour previous edit failed: ${outcome.error}\nRe-emit corrected search/replace blocks.`;
      agentText = await deps.runAgent(retryPrompt, { logDir: revDir });
      outcome = attempt(indexHtml, agentText);
      if (!outcome.ok) throw new Error(outcome.error);
    }

    await writeFile(indexPath, outcome.result, "utf8");
    const files = await listFiles(revDir);
    return { artifacts: indexArtifacts({ jobId: record.id, outputRoot: record.outputRoot, artifactPaths: files }) };
  };
}
