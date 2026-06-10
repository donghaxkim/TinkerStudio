import { DemoProjectSchema } from "@tinker/project-schema";
import sampleProjectInput from "../../../project-schema/fixtures/demo-project.sample.json";

export const sampleProject = DemoProjectSchema.parse(sampleProjectInput);
