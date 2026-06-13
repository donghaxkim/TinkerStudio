import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { DemoProjectSchema, parseDemoProject } from "./validators.js";

const sampleProjectInput = JSON.parse(
  readFileSync(new URL("../fixtures/demo-project.sample.json", import.meta.url), "utf8"),
) as z.input<typeof DemoProjectSchema>;

export const sampleProject = parseDemoProject(sampleProjectInput);

/**
 * The golden generated-project fixture (PB-010): a valid DemoProject that matches
 * the editor design reference (driftboard demo — 4 named clips + 2 named zoom moves).
 * It is the canonical example of Person A's expected generation output and is what the
 * web app loads as both the "Use sample project" content and the mock generation result.
 */
const goldenProjectInput = JSON.parse(
  readFileSync(new URL("../fixtures/person-a-generated-project.sample.json", import.meta.url), "utf8"),
) as z.input<typeof DemoProjectSchema>;

export const goldenProject = parseDemoProject(goldenProjectInput);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const project of [sampleProject, goldenProject]) {
    const parsed = parseDemoProject(project);
    console.log(`Validated DemoProject ${parsed.id} with schema ${parsed.schemaVersion}`);
  }
}
