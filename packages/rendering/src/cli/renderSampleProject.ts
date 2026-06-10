import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DemoProjectSchema } from "@tinker/project-schema";
import { renderFinalToMp4 } from "../node/index.js";

const outputArg = process.argv.find((arg, index) => index > 1 && arg !== "--");
const outputPath = resolve(outputArg ?? "/tmp/tinker-sample-export.mp4");
const sampleProjectUrl = new URL("../../../project-schema/fixtures/demo-project.sample.json", import.meta.url);
const sampleProject = DemoProjectSchema.parse(JSON.parse(readFileSync(sampleProjectUrl, "utf8")));

const result = await renderFinalToMp4(sampleProject, { outputPath });

console.log(JSON.stringify(result.artifact, null, 2));
