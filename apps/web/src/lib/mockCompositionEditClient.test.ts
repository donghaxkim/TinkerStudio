import { describe, expect, it, vi } from "vitest";
import { createMockCompositionEditClient } from "./mockCompositionEditClient.js";

describe("createMockCompositionEditClient", () => {
  it("returns a new revision with distinct id + cache-busted urls per edit", async () => {
    const client = createMockCompositionEditClient();
    const r1 = await client.editComposition({ jobId: "job-1", instruction: "punch in", context: [] });
    const r2 = await client.editComposition({ jobId: "job-1", instruction: "again", context: [] });
    expect(r1.id).toBe("rev-1");
    expect(r2.id).toBe("rev-2");
    expect(r1.compositionIndexUrl).toContain("/api/jobs/job-1/artifacts/hyperframes/index.html");
    expect(r1.compositionIndexUrl).not.toBe(r2.compositionIndexUrl);
  });

  it("emits a running update before resolving", async () => {
    const client = createMockCompositionEditClient();
    const updates: string[] = [];
    await client.editComposition({ jobId: "j", instruction: "x", context: [] }, { onUpdate: (s) => updates.push(s) });
    expect(updates).toEqual(["running"]);
  });

  it("rejects if already aborted", async () => {
    const client = createMockCompositionEditClient();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      client.editComposition({ jobId: "j", instruction: "x", context: [] }, { signal: ctrl.signal }),
    ).rejects.toThrow();
  });
});
