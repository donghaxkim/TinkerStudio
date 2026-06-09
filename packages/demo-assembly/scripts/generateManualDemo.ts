import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPlaywrightCapture, startFixtureServer } from "@tinker/browser-capture";
import { compileProject } from "../src/compileProject.js";
import { createManualDemoCapturePlan, createManualDemoStoryboard } from "../src/manualDemo.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outputRoot = join(repoRoot, "generated", "manual-demo");
const captureOutputDir = join(outputRoot, "capture");
const fixtureUrl = new URL("../../browser-capture/fixtures/manual-demo.html", import.meta.url);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(captureOutputDir, { recursive: true });

const server = await startFixtureServer(fixtureUrl);

try {
  const storyboard = createManualDemoStoryboard();
  const capturePlan = createManualDemoCapturePlan(server.url);
  const captureResult = await runPlaywrightCapture(capturePlan, { outputDir: captureOutputDir, headless: true });
  const project = compileProject({
    projectId: "manual-demo-fixture",
    storyboard,
    capturePlan,
    captureResult,
    outputRoot,
    createdAt: new Date().toISOString(),
    productUrl: server.url,
    prompt: "Show why Tinker can generate editable product demo videos.",
  });

  const captureResultPath = join(outputRoot, "capture-result.json");
  const projectPath = join(outputRoot, "demo-project.json");

  await writeFile(captureResultPath, `${JSON.stringify(captureResult, null, 2)}\n`);
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);

  console.log(`Generated DemoProject: ${projectPath}`);
  console.log(
    `Capture counts: ${captureResult.clips.length} clips, ${captureResult.screenshots.length} screenshots, ${captureResult.events.length} events, ${captureResult.checkpoints.length} checkpoints`,
  );
} finally {
  await server.close();
}
