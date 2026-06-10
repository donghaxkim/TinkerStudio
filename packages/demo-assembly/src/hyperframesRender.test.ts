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
  return { status: 0, stdout: `${command.args.join(" ")} ok`, stderr: `${command.args.join(" ")} warning` };
};

const result = await runHyperframesRender({ hyperframesDir, outputVideoPath, runCommand: runner });
assert.equal(result.lintLogPath, join(hyperframesDir, "lint.log"));
assert.equal(result.renderLogPath, join(hyperframesDir, "render.log"));
assert.equal(result.outputVideoPath, outputVideoPath);
assert.equal(calls.length, 2);
assert.deepEqual(calls[0], { command: "npx", args: ["hyperframes", "lint"], cwd: hyperframesDir, timeoutMs: 120_000 });
assert.deepEqual(calls[1], {
  command: "npx",
  args: ["hyperframes", "render", "--output", outputVideoPath],
  cwd: hyperframesDir,
  timeoutMs: 600_000,
});
const lintLog = await readFile(result.lintLogPath, "utf8");
const renderLog = await readFile(result.renderLogPath, "utf8");
assert.match(lintLog, /hyperframes lint ok/);
assert.match(lintLog, /hyperframes lint warning/);
assert.match(renderLog, /hyperframes render --output/);
assert.match(renderLog, /hyperframes render --output .* warning/);

await assert.rejects(
  () =>
    runHyperframesRender({
      hyperframesDir,
      outputVideoPath,
      runCommand: async (command) => ({ status: command.args.includes("lint") ? 1 : 0, stdout: "", stderr: "lint failed" }),
    }),
  /Hyperframes lint failed/,
);

const lintFailureDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-lint-failure-"));
const lintFailureCalls: Parameters<HyperframesCommandRun>[0][] = [];
await assert.rejects(
  () =>
    runHyperframesRender({
      hyperframesDir: lintFailureDir,
      outputVideoPath: join(lintFailureDir, "output.mp4"),
      runCommand: async (command) => {
        lintFailureCalls.push(command);
        return { status: command.args.includes("lint") ? 1 : 0, stdout: "lint stdout", stderr: "lint stderr" };
      },
    }),
  /Hyperframes lint failed/,
);
assert.equal(lintFailureCalls.length, 1);
assert.deepEqual(lintFailureCalls[0]?.args, ["hyperframes", "lint"]);
assert.match(await readFile(join(lintFailureDir, "lint.log"), "utf8"), /lint stderr/);

const timeoutDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-timeout-"));
await assert.rejects(
  () =>
    runHyperframesRender({
      hyperframesDir: timeoutDir,
      outputVideoPath: join(timeoutDir, "output.mp4"),
      runCommand: async () => ({ status: null, stdout: "partial stdout", stderr: "partial stderr", timedOut: true }),
    }),
  /timed out/i,
);
const timeoutLog = await readFile(join(timeoutDir, "lint.log"), "utf8");
assert.match(timeoutLog, /partial stdout/);
assert.match(timeoutLog, /timedOut: true/);

const rejectedRunnerDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-rejection-"));
await assert.rejects(
  () =>
    runHyperframesRender({
      hyperframesDir: rejectedRunnerDir,
      outputVideoPath: join(rejectedRunnerDir, "output.mp4"),
      runCommand: async () => {
        throw new Error("runner exploded");
      },
    }),
  /Hyperframes lint failed/,
);
assert.match(await readFile(join(rejectedRunnerDir, "lint.log"), "utf8"), /runner exploded/);

console.log("hyperframes render tests passed");
