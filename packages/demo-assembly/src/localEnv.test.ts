import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { loadLocalEnvFile, resolveWorkspaceEnvPath } from "./localEnv.js";

const envDirectory = await mkdtemp(join(tmpdir(), "tinker-local-env-"));
const envPath = join(envDirectory, ".env");

const originalPlannerModel = process.env.TINKER_AI_URL_PLANNER_MODEL;
const originalPlannerEndpoint = process.env.TINKER_AI_URL_PLANNER_ENDPOINT;

assert.equal(
  resolveWorkspaceEnvPath(pathToFileURL("/workspace/packages/demo-assembly/scripts/generateAiUrlJob.ts").href),
  "/workspace/.env",
);

try {
  process.env.TINKER_AI_URL_PLANNER_MODEL = "existing-model";
  delete process.env.TINKER_AI_URL_PLANNER_ENDPOINT;

  await writeFile(
    envPath,
    [
      "TINKER_AI_URL_PLANNER_MODEL=loaded-model",
      "TINKER_AI_URL_PLANNER_ENDPOINT=http://127.0.0.1:8317/v1/chat/completions",
      "",
    ].join("\n"),
  );

  assert.equal(loadLocalEnvFile(envPath), true);
  assert.equal(process.env.TINKER_AI_URL_PLANNER_MODEL, "existing-model");
  assert.equal(process.env.TINKER_AI_URL_PLANNER_ENDPOINT, "http://127.0.0.1:8317/v1/chat/completions");
  assert.equal(loadLocalEnvFile(join(envDirectory, "missing.env")), false);
} finally {
  if (originalPlannerModel === undefined) {
    delete process.env.TINKER_AI_URL_PLANNER_MODEL;
  } else {
    process.env.TINKER_AI_URL_PLANNER_MODEL = originalPlannerModel;
  }

  if (originalPlannerEndpoint === undefined) {
    delete process.env.TINKER_AI_URL_PLANNER_ENDPOINT;
  } else {
    process.env.TINKER_AI_URL_PLANNER_ENDPOINT = originalPlannerEndpoint;
  }
}

console.log("local env tests passed");
