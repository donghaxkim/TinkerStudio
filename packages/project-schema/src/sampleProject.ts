import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { DemoProjectSchema, parseDemoProject } from "./validators.js";

const sampleProjectInput = JSON.parse(
  readFileSync(new URL("../fixtures/demo-project.sample.json", import.meta.url), "utf8"),
) as z.input<typeof DemoProjectSchema>;

export const sampleProject = parseDemoProject(sampleProjectInput);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parsed = parseDemoProject(sampleProject);
  console.log(`Validated DemoProject ${parsed.id} with schema ${parsed.schemaVersion}`);
}
