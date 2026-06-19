import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { runHyperframesRender, type HyperframesCommandRun } from "./hyperframesRender.js";

function isPathInside(parent: string, child: string) {
  const relativePath = relative(parent, child);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const hyperframesDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-render-"));
await mkdir(hyperframesDir, { recursive: true });
const outputVideoPath = join(hyperframesDir, "output.mp4");
const signalController = new AbortController();

const calls: Parameters<HyperframesCommandRun>[0][] = [];
const runner: HyperframesCommandRun = async (command) => {
  calls.push(command);
  return { status: 0, stdout: `${command.args.join(" ")} ok`, stderr: `${command.args.join(" ")} warning` };
};

const result = await runHyperframesRender({ hyperframesDir, outputVideoPath, runCommand: runner, signal: signalController.signal });
assert.equal(result.lintLogPath, join(hyperframesDir, "lint.log"));
assert.equal(result.renderLogPath, join(hyperframesDir, "render.log"));
assert.equal(result.outputVideoPath, outputVideoPath);
assert.equal(calls.length, 2);
assert.deepEqual(calls[0], {
  command: "npx",
  args: ["--yes", "--package", "hyperframes", "hyperframes", "lint"],
  cwd: hyperframesDir,
  timeoutMs: 120_000,
  signal: signalController.signal,
});
assert.deepEqual(calls[1], {
  command: "npx",
  args: ["--yes", "--package", "hyperframes", "hyperframes", "render", "--output", outputVideoPath],
  cwd: hyperframesDir,
  timeoutMs: 600_000,
  signal: signalController.signal,
});
const lintLog = await readFile(result.lintLogPath, "utf8");
const renderLog = await readFile(result.renderLogPath, "utf8");
assert.match(lintLog, /hyperframes lint ok/);
assert.match(lintLog, /hyperframes lint warning/);
assert.match(renderLog, /hyperframes render --output/);
assert.match(renderLog, /hyperframes render --output .* warning/);

const cleanupSuccessRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-cleanup-success-"));
const cleanupSuccessDir = join(cleanupSuccessRoot, "hyperframes");
const cleanupSuccessRunnerRoot = join(cleanupSuccessRoot, ".tinker-hyperframes-runner");
await mkdir(cleanupSuccessDir);
await mkdir(cleanupSuccessRunnerRoot, { recursive: true });
await runHyperframesRender({
  hyperframesDir: cleanupSuccessDir,
  outputVideoPath: join(cleanupSuccessDir, "output.mp4"),
  runCommand: runner,
});
assert.equal(await pathExists(cleanupSuccessRunnerRoot), false);
assert.equal(await pathExists(join(cleanupSuccessDir, "lint.log")), true);
assert.equal(await pathExists(join(cleanupSuccessDir, "render.log")), true);

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
assert.deepEqual(lintFailureCalls[0]?.args, ["--yes", "--package", "hyperframes", "hyperframes", "lint"]);
assert.match(await readFile(join(lintFailureDir, "lint.log"), "utf8"), /lint stderr/);

const cleanupLintFailureRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-cleanup-lint-failure-"));
const cleanupLintFailureDir = join(cleanupLintFailureRoot, "hyperframes");
const cleanupLintFailureRunnerRoot = join(cleanupLintFailureRoot, ".tinker-hyperframes-runner");
await mkdir(cleanupLintFailureDir);
await mkdir(cleanupLintFailureRunnerRoot, { recursive: true });
await assert.rejects(
  () =>
    runHyperframesRender({
      hyperframesDir: cleanupLintFailureDir,
      outputVideoPath: join(cleanupLintFailureDir, "output.mp4"),
      runCommand: async () => ({ status: 1, stdout: "lint stdout", stderr: "lint stderr" }),
    }),
  /Hyperframes lint failed/,
);
assert.equal(await pathExists(cleanupLintFailureRunnerRoot), false);
assert.equal(await pathExists(join(cleanupLintFailureDir, "lint.log")), true);

const cleanupRenderFailureRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-cleanup-render-failure-"));
const cleanupRenderFailureDir = join(cleanupRenderFailureRoot, "hyperframes");
const cleanupRenderFailureRunnerRoot = join(cleanupRenderFailureRoot, ".tinker-hyperframes-runner");
await mkdir(cleanupRenderFailureDir);
await mkdir(cleanupRenderFailureRunnerRoot, { recursive: true });
await assert.rejects(
  () =>
    runHyperframesRender({
      hyperframesDir: cleanupRenderFailureDir,
      outputVideoPath: join(cleanupRenderFailureDir, "output.mp4"),
      runCommand: async (command) => ({
        status: command.args.includes("render") ? 1 : 0,
        stdout: command.args.includes("render") ? "render stdout" : "lint stdout",
        stderr: command.args.includes("render") ? "render stderr" : "lint stderr",
      }),
    }),
  /Hyperframes render failed/,
);
assert.equal(await pathExists(cleanupRenderFailureRunnerRoot), false);
assert.equal(await pathExists(join(cleanupRenderFailureDir, "lint.log")), true);
assert.equal(await pathExists(join(cleanupRenderFailureDir, "render.log")), true);

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

const sanitizedEnvRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-sanitized-env-"));
const sanitizedEnvDir = join(sanitizedEnvRoot, "hyperframes");
await mkdir(sanitizedEnvDir);
const sanitizedEnvBinDir = join(sanitizedEnvRoot, "bin");
await mkdir(sanitizedEnvBinDir);
const sanitizedEnvFakeNpxPath = join(sanitizedEnvBinDir, "npx");
await writeFile(
  sanitizedEnvFakeNpxPath,
  `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const step = process.argv.includes("lint") ? "lint" : "render";
const report = {
  hasPath: typeof process.env.PATH === "string" && process.env.PATH.length > 0,
  leakedSecret: Object.prototype.hasOwnProperty.call(process.env, "TINKER_SECRET_SHOULD_NOT_LEAK"),
  home: process.env.HOME,
  npmCache: process.env.NPM_CONFIG_CACHE,
  npmUserconfig: process.env.NPM_CONFIG_USERCONFIG,
};

writeFileSync(join(process.cwd(), \`env-\${step}.json\`), JSON.stringify(report));

if (!report.hasPath) {
  process.stderr.write("PATH missing\\n");
  process.exit(1);
}

if (report.leakedSecret) {
  process.stderr.write("secret leaked\\n");
  process.exit(1);
}

process.stdout.write(\`\${step} env ok\\n\`);
`,
);
await chmod(sanitizedEnvFakeNpxPath, 0o755);
const originalSanitizedEnvPath = process.env.PATH;
const originalSanitizedEnvHome = process.env.HOME;
const originalSecret = process.env.TINKER_SECRET_SHOULD_NOT_LEAK;
const hostHome = join(tmpdir(), "tinker-host-home-should-not-leak");
process.env.PATH = `${sanitizedEnvBinDir}${delimiter}${originalSanitizedEnvPath ?? ""}`;
process.env.HOME = hostHome;
process.env.TINKER_SECRET_SHOULD_NOT_LEAK = "secret should stay in parent";
try {
  await runHyperframesRender({ hyperframesDir: sanitizedEnvDir, outputVideoPath: join(sanitizedEnvDir, "output.mp4") });
} finally {
  if (originalSanitizedEnvPath === undefined) {
    delete process.env.PATH;
  } else {
    process.env.PATH = originalSanitizedEnvPath;
  }
  if (originalSanitizedEnvHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalSanitizedEnvHome;
  }
  if (originalSecret === undefined) {
    delete process.env.TINKER_SECRET_SHOULD_NOT_LEAK;
  } else {
    process.env.TINKER_SECRET_SHOULD_NOT_LEAK = originalSecret;
  }
}
const expectedRunnerRoot = join(dirname(sanitizedEnvDir), ".tinker-hyperframes-runner");
const expectedRunnerHome = join(expectedRunnerRoot, "home");
const expectedNpmCache = join(expectedRunnerRoot, "npm-cache");
const expectedNpmUserconfig = join(expectedRunnerRoot, "npmrc");
const lintEnv = JSON.parse(await readFile(join(sanitizedEnvDir, "env-lint.json"), "utf8"));
const renderEnv = JSON.parse(await readFile(join(sanitizedEnvDir, "env-render.json"), "utf8"));
assert.deepEqual(lintEnv, {
  hasPath: true,
  leakedSecret: false,
  home: expectedRunnerHome,
  npmCache: expectedNpmCache,
  npmUserconfig: expectedNpmUserconfig,
});
assert.deepEqual(renderEnv, {
  hasPath: true,
  leakedSecret: false,
  home: expectedRunnerHome,
  npmCache: expectedNpmCache,
  npmUserconfig: expectedNpmUserconfig,
});
assert.notEqual(lintEnv.home, hostHome);
for (const value of [lintEnv.home, lintEnv.npmCache, lintEnv.npmUserconfig, renderEnv.home, renderEnv.npmCache, renderEnv.npmUserconfig]) {
  assert.equal(isPathInside(sanitizedEnvDir, value), false);
  assert.equal(isPathInside(dirname(sanitizedEnvDir), value), true);
}
assert.equal(await pathExists(expectedRunnerRoot), false);

const defaultTimeoutDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-default-timeout-"));
const fakeBinDir = join(defaultTimeoutDir, "bin");
await mkdir(fakeBinDir);
const fakeNpxPath = join(fakeBinDir, "npx");
await writeFile(
  fakeNpxPath,
  `#!/usr/bin/env node
const { spawn } = require("node:child_process");

process.stdout.write("lint started\\n");
const child = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 2000)"], {
  detached: true,
  stdio: ["ignore", "inherit", "inherit"],
});
child.unref();
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
);
await chmod(fakeNpxPath, 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${fakeBinDir}${delimiter}${originalPath ?? ""}`;
const fallbackStartedAt = Date.now();
let fallbackBound: ReturnType<typeof setTimeout> | undefined;
try {
  await assert.rejects(
    () =>
      Promise.race([
        runHyperframesRender({
          hyperframesDir: defaultTimeoutDir,
          outputVideoPath: join(defaultTimeoutDir, "output.mp4"),
          lintTimeoutMs: 500,
          timeoutKillGraceMs: 50,
          timeoutCloseFallbackMs: 50,
        }),
        new Promise((_, reject) => {
          fallbackBound = setTimeout(() => reject(new Error("hard fallback did not settle")), 1_500);
        }),
      ]),
    /timed out/i,
  );
} finally {
  if (fallbackBound !== undefined) {
    clearTimeout(fallbackBound);
  }
  process.env.PATH = originalPath;
}
assert.ok(Date.now() - fallbackStartedAt < 1_500);
const defaultTimeoutLog = await readFile(join(defaultTimeoutDir, "lint.log"), "utf8");
assert.match(defaultTimeoutLog, /timedOut: true/);
assert.match(defaultTimeoutLog, /lint started/);

const abortDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-abort-"));
const abortBinDir = join(abortDir, "bin");
await mkdir(abortBinDir);
const abortFakeNpxPath = join(abortBinDir, "npx");
await writeFile(
  abortFakeNpxPath,
  `#!/usr/bin/env node
process.stdout.write("lint started\\n");
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
);
await chmod(abortFakeNpxPath, 0o755);
const abortOriginalPath = process.env.PATH;
process.env.PATH = `${abortBinDir}${delimiter}${abortOriginalPath ?? ""}`;
const abortController = new AbortController();
let abortFallbackBound: ReturnType<typeof setTimeout> | undefined;
try {
  const running = Promise.race([
    runHyperframesRender({
      hyperframesDir: abortDir,
      outputVideoPath: join(abortDir, "output.mp4"),
      signal: abortController.signal,
      timeoutKillGraceMs: 50,
      timeoutCloseFallbackMs: 50,
    }),
    new Promise((_, reject) => {
      abortFallbackBound = setTimeout(() => reject(new Error("abort did not settle")), 1_500);
    }),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  abortController.abort();
  await assert.rejects(() => running, /Hyperframes lint failed/);
} finally {
  if (abortFallbackBound !== undefined) {
    clearTimeout(abortFallbackBound);
  }
  process.env.PATH = abortOriginalPath;
}
const abortLog = await readFile(join(abortDir, "lint.log"), "utf8");
assert.match(abortLog, /Aborted/);

const oversizedLogDir = await mkdtemp(join(tmpdir(), "tinker-hyperframes-oversized-log-"));
const oversizedStdout = `${"stdout-start\n"}${"o".repeat(200_000)}\nstdout-end`;
const oversizedStderr = `${"stderr-start\n"}${"e".repeat(200_000)}\nstderr-end`;
const oversizedResult = await runHyperframesRender({
  hyperframesDir: oversizedLogDir,
  outputVideoPath: join(oversizedLogDir, "output.mp4"),
  runCommand: async () => ({ status: 0, stdout: oversizedStdout, stderr: oversizedStderr }),
});
const oversizedLintLog = await readFile(oversizedResult.lintLogPath, "utf8");
assert.match(oversizedLintLog, /stdout truncated/i);
assert.match(oversizedLintLog, /stderr truncated/i);
assert.match(oversizedLintLog, /stdout-end/);
assert.match(oversizedLintLog, /stderr-end/);
assert.doesNotMatch(oversizedLintLog, /stdout-start/);
assert.doesNotMatch(oversizedLintLog, /stderr-start/);
assert.ok(Buffer.byteLength(oversizedLintLog, "utf8") < 140_000);

console.log("hyperframes render tests passed");
