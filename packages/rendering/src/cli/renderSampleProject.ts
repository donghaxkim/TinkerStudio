import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoProjectSchema } from "@tinker/project-schema";
import { probeMp4Artifact, renderFinalToMp4 } from "../node/index.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const outputArg = args[0];
const projectRootArg = args[1];
const outputPath = resolve(outputArg ?? "/tmp/tinker-sample-export.mp4");
const sampleProjectUrl = new URL("../../../project-schema/fixtures/demo-project.sample.json", import.meta.url);
const sampleProjectRoot = dirname(fileURLToPath(sampleProjectUrl));
const projectRoot = projectRootArg ? resolve(projectRootArg) : sampleProjectRoot;
const sampleProject = DemoProjectSchema.parse(JSON.parse(readFileSync(sampleProjectUrl, "utf8")));

const result = await renderFinalToMp4(sampleProject, { outputPath, projectRoot, allowedOutputRoots: [dirname(outputPath)] });
const probe = await probeMp4Artifact(outputPath);

console.log(JSON.stringify({ artifact: result.artifact, probe }, null, 2));
