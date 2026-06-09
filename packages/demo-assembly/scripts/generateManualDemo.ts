import { defaultManualDemoOutputRoot, runManualDemo } from "../src/runManualDemo.js";

const result = await runManualDemo({
  outputRoot: defaultManualDemoOutputRoot(),
  projectId: "manual-demo-fixture",
  createdAt: new Date().toISOString(),
  prompt: "Show why Tinker can generate editable product demo videos.",
});

console.log(`Generated DemoProject: ${result.projectPath}`);
console.log(
  `Capture counts: ${result.captureCounts.clips} clips, ${result.captureCounts.screenshots} screenshots, ${result.captureCounts.events} events, ${result.captureCounts.checkpoints} checkpoints`,
);
