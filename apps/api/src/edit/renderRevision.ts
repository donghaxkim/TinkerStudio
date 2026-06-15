import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { runHyperframesRender } from "@tinker/demo-assembly";
import { buildHyperframesRevisionResult, indexArtifacts } from "../jobs/artifactIndex.js";
import type { RunRender } from "../workers/renderWorker.js";

export function createDefaultRunRender(): RunRender {
  return async (record, render) => {
    const revDir = join(record.outputRoot, "revisions", render.revId, "hyperframes");
    await runHyperframesRender({ hyperframesDir: revDir, outputVideoPath: join(revDir, "output.mp4") });
    const files = await listFiles(revDir);
    const artifacts = indexArtifacts({ jobId: record.id, outputRoot: record.outputRoot, artifactPaths: files });
    return buildHyperframesRevisionResult(artifacts);
  };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(f)));
    else out.push(f);
  }
  return out;
}
