import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../project-schema/fixtures/demo-project.sample.json";
import { prepareMp4Export } from "./prepareMp4Export.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("prepareMp4Export", () => {
  it("prepares MP4 export metadata for the current DemoProject", () => {
    const result = prepareMp4Export(sampleProject);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.output.fileName).toBe("sample-product-demo.mp4");
    expect(result.plan.output.mimeType).toBe("video/mp4");
    expect(result.plan.layers.length).toBeGreaterThan(0);
  });
});
