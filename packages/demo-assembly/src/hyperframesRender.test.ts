import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHyperframesRender, type HyperframesCommandRun } from "./hyperframesRender.js";

const hyperframesDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-render-"));
await mkdir(hyperframesDir, { recursive: true });
const outputVideoPath = join(hyperframesDir, "output.mp4");

const calls: Parameters<HyperframesCommandRun>[0][] = [];
const runner: HyperframesCommandRun = async (command) => {
  calls.push(command);
  return { status: 0, stdout: `${command.args.join(" ")} ok`, stderr: "" };
};

const result = await runHyperframesRender({ hyperframesDir, outputVideoPath, runCommand: runner });
assert.equal(result.lintLogPath, join(hyperframesDir, "lint.log"));
assert.equal(result.renderLogPath, join(hyperframesDir, "render.log"));
assert.equal(calls.length, 2);
assert.deepEqual(calls[0], { command: "npx", args: ["hyperframes", "lint"], cwd: hyperframesDir, timeoutMs: 120_000 });
assert.deepEqual(calls[1], {
  command: "npx",
  args: ["hyperframes", "render", "--output", outputVideoPath],
  cwd: hyperframesDir,
  timeoutMs: 600_000,
});
assert.match(await readFile(result.lintLogPath, "utf8"), /hyperframes lint ok/);
assert.match(await readFile(result.renderLogPath, "utf8"), /hyperframes render --output/);

await assert.rejects(
  () =>
    runHyperframesRender({
      hyperframesDir,
      outputVideoPath,
      runCommand: async (command) => ({ status: command.args.includes("lint") ? 1 : 0, stdout: "", stderr: "lint failed" }),
    }),
  /Hyperframes lint failed/,
);

console.log("hyperframes render tests passed");
