import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpawnedTestreelCliRunner, runTestreelRecording, type RunTestreelCli } from "./testreelRunner.js";
import type { TestreelGenerationPlan } from "./testreelPlan.js";

const outputRoot = await mkdtemp(join(tmpdir(), "tinker-testreel-runner-"));
const plan: TestreelGenerationPlan = {
  engine: "testreel",
  definition: {
    url: "https://example.com",
    viewport: { width: 1280, height: 720 },
    outputSize: { width: 1920, height: 1080 },
    outputFormat: "mp4",
    cursor: { enabled: true },
    chrome: { enabled: true, url: true },
    background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" } },
    steps: [{ action: "wait", ms: 1 }, { action: "screenshot", name: "final" }],
  },
  expectedCheckpoints: [{ id: "final", label: "Final", selector: "body" }],
};

const calls: string[][] = [];
const fakeRunCli: RunTestreelCli = async (args) => {
  calls.push(args);
  if (args[0] === "validate") return { stdout: "validated", stderr: "" };
  const outputFlagIndex = args.indexOf("--output");
  const outputDir = args[outputFlagIndex + 1];
  if (outputDir === undefined) throw new Error("missing output dir");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "output.json"), JSON.stringify({ ok: true }));
  await writeFile(join(outputDir, "final-shot.png"), "png");
  await writeFile(join(outputDir, "recording.mp4"), "mp4");
  return { stdout: "recorded", stderr: "" };
};

const result = await runTestreelRecording({ testreelRoot: outputRoot, plan, runCli: fakeRunCli });
assert.deepEqual(calls[0], ["validate", join(outputRoot, "recording.json"), "--quiet"]);
assert.deepEqual(calls[1], [join(outputRoot, "recording.json"), "--output", join(outputRoot, "output"), "--format", "mp4", "--clean", "--quiet"]);
assert.equal(await readFile(join(outputRoot, "recording-plan.json"), "utf8").then((v) => JSON.parse(v).engine), "testreel");
assert.equal(await readFile(join(outputRoot, "recording.json"), "utf8").then((v) => JSON.parse(v).outputFormat), "mp4");
assert.equal(result.finalVideoPath, join(outputRoot, "final.mp4"));
assert.equal(existsSync(result.finalVideoPath), true);
assert.equal(result.manifestPath, join(outputRoot, "output", "output.json"));
assert.deepEqual(result.screenshotPaths, [join(outputRoot, "output", "final-shot.png")]);
assert.ok(result.artifactPaths.includes(join(outputRoot, "recording-plan.json")));
assert.ok(result.artifactPaths.includes(join(outputRoot, "recording.json")));
assert.ok(result.artifactPaths.includes(join(outputRoot, "final.mp4")));

const webmOutputRoot = await mkdtemp(join(tmpdir(), "tinker-testreel-runner-webm-"));
const ffmpegCalls: string[][] = [];
const webmResult = await runTestreelRecording({
  testreelRoot: webmOutputRoot,
  plan,
  runCli: async (args) => {
    if (args[0] === "validate") return { stdout: "validated", stderr: "" };
    const outputDir = args[args.indexOf("--output") + 1];
    if (outputDir === undefined) throw new Error("missing output dir");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "output.json"), JSON.stringify({ video: "recording.webm", screenshots: [] }));
    await writeFile(join(outputDir, "recording.webm"), "webm");
    return { stdout: "recorded", stderr: "" };
  },
  runFfmpeg: async (args) => {
    ffmpegCalls.push(args);
    await writeFile(args.at(-1)!, "mp4");
    return { stdout: "", stderr: "" };
  },
});
assert.equal(webmResult.finalVideoPath, join(webmOutputRoot, "final.mp4"));
assert.equal(existsSync(webmResult.finalVideoPath), true);
assert.ok(ffmpegCalls[0]?.includes(join(webmOutputRoot, "output", "recording.webm")));
assert.equal(ffmpegCalls[0]?.at(-1), join(webmOutputRoot, "final.mp4"));

await assert.rejects(
  async () =>
    runTestreelRecording({
      testreelRoot: await mkdtemp(join(tmpdir(), "tinker-testreel-runner-missing-final-")),
      plan,
      runCli: async (args) => {
        if (args[0] === "validate") return { stdout: "validated", stderr: "" };
        const outputDir = args[args.indexOf("--output") + 1];
        if (outputDir === undefined) throw new Error("missing output dir");
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, "output.json"), JSON.stringify({ video: "recording.webm", screenshots: [] }));
        await writeFile(join(outputDir, "recording.webm"), "webm");
        return { stdout: "recorded", stderr: "" };
      },
      runFfmpeg: async () => ({ stdout: "", stderr: "" }),
    }),
  /Testreel assembly failed to create non-empty final\.mp4/,
);

await assert.rejects(
  async () =>
    runTestreelRecording({
      testreelRoot: await mkdtemp(join(tmpdir(), "tinker-testreel-runner-missing-mp4-")),
      plan,
      runCli: async (args) => {
        if (args[0] !== "validate") await mkdir(args[args.indexOf("--output") + 1]!, { recursive: true });
        return { stdout: "", stderr: "" };
      },
    }),
  /Testreel completed without producing an MP4/,
);

if (process.platform !== "win32") {
  const root = await mkdtemp(join(tmpdir(), "tinker-testreel-runner-abort-"));
  const fakeCliPath = join(root, "fake-testreel-cli.cjs");
  const startedPath = join(root, "started.txt");
  const sigtermPath = join(root, "sigterm.txt");
  await writeFile(
    fakeCliPath,
    [
      "#!/usr/bin/env node",
      "const { writeFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      `writeFileSync(${JSON.stringify(startedPath)}, 'started');`,
      `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(sigtermPath)}, 'SIGTERM'); process.exit(0); });`,
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );
  await chmod(fakeCliPath, 0o755);
  const controller = new AbortController();
  const runCli = createSpawnedTestreelCliRunner({ command: process.execPath, argsPrefix: [fakeCliPath], cwd: root });
  const aborted = runCli(["validate", "recording.json", "--quiet"], { signal: controller.signal });
  while (!existsSync(startedPath)) await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await assert.rejects(aborted, { name: "AbortError" });
  assert.equal(await readFile(sigtermPath, "utf8"), "SIGTERM");
}

console.log("testreel runner tests passed");
