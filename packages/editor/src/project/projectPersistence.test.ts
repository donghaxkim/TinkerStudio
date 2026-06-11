import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import {
  deserializeDemoProjectJson,
  formatProjectValidationIssues,
  MAX_DEMO_PROJECT_JSON_BYTES,
  serializeDemoProject,
} from "./projectPersistence.js";

describe("projectPersistence", () => {
  it("serializes a valid DemoProject as full pretty JSON", () => {
    const result = serializeDemoProject(sampleProject);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected serialization success");

    const parsed = JSON.parse(result.json) as unknown;
    expect(parsed).toEqual(sampleProject);
    expect(result.json).toContain('\n  "schemaVersion": "0.1.0"');
    expect(result.json).toContain('"assets"');
    expect(result.json).toContain('"tracks"');
    expect(result.json).toContain('"zooms"');
    expect(result.json).toContain('"cursorEvents"');
    expect(result.json).toContain('"aiEditHistory"');
    expect(result.json).not.toContain('"captions"');
    expect(result.json).not.toContain('"callouts"');
  });

  it("deserializes valid DemoProject JSON through the schema validator", () => {
    const serialized = serializeDemoProject(sampleProject);
    if (!serialized.ok) throw new Error("expected serialization success");

    const loaded = deserializeDemoProjectJson(serialized.json);

    expect(loaded).toEqual({ ok: true, project: sampleProject });
  });

  it("rejects invalid JSON", () => {
    const loaded = deserializeDemoProjectJson("{not valid json");

    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error("expected load failure");
    expect(loaded.error.message).toBe("Project JSON could not be parsed");
    expect(loaded.error.issues[0]).toMatch(/JSON|Unexpected|Expected/);
  });

  it("rejects DemoProject JSON above the safe size before parsing", () => {
    const oversized = " ".repeat(MAX_DEMO_PROJECT_JSON_BYTES + 1);

    const loaded = deserializeDemoProjectJson(oversized);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error("expected load failure");
    expect(loaded.error.message).toBe("Project JSON is too large");
  });

  it("rejects unknown schema versions", () => {
    const loaded = deserializeDemoProjectJson(JSON.stringify({ ...sampleProject, schemaVersion: "999.0.0" }));

    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error("expected load failure");
    expect(loaded.error.issues.join("\n")).toContain("schemaVersion");
  });

  it("rejects JSON that is not a valid DemoProject", () => {
    const loaded = deserializeDemoProjectJson(JSON.stringify({ ...sampleProject, duration: -1 }));

    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error("expected load failure");
    expect(loaded.error.message).toBe("DemoProject validation failed");
    expect(loaded.error.issues).toContain("duration: Too small: expected number to be >0");
  });

  it("formats root-level validation issues", () => {
    const issues = formatProjectValidationIssues([
      { path: [], message: "expected object" },
      { path: ["tracks", 0, "clips", 0, "assetId"], message: "unknown asset" },
    ]);

    expect(issues).toEqual([
      "project: expected object",
      "tracks.0.clips.0.assetId: unknown asset",
    ]);
  });
});
