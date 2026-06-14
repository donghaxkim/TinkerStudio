import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCompositionEditFlow } from "./useCompositionEditFlow.js";
import type { CompositionEditClient, CompositionRevision } from "../../lib/compositionEditClient.js";

const base: CompositionRevision = { id: "rev-0", compositionIndexUrl: "/base/index.html", outputVideoUrl: "/base/out.mp4" };

function clientReturning(rev: CompositionRevision): CompositionEditClient {
  return { editComposition: async () => rev };
}
function clientRejecting(message: string): CompositionEditClient {
  return { editComposition: async () => { throw new Error(message); } };
}

describe("useCompositionEditFlow", () => {
  it("starts on the base revision", () => {
    const { result } = renderHook(() => useCompositionEditFlow({ jobId: "j", client: clientReturning(base), baseRevision: base }));
    expect(result.current.status).toBe("idle");
    expect(result.current.currentCompositionUrl).toBe("/base/index.html");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.isPreviewing).toBe(false);
  });

  it("submit drafts a revision and previews it", async () => {
    const rev: CompositionRevision = { id: "rev-1", compositionIndexUrl: "/rev1/index.html" };
    const { result } = renderHook(() => useCompositionEditFlow({ jobId: "j", client: clientReturning(rev), baseRevision: base }));
    await act(async () => { await result.current.submit("punch in", []); });
    expect(result.current.status).toBe("preview");
    expect(result.current.isPreviewing).toBe(true);
    expect(result.current.currentCompositionUrl).toBe("/rev1/index.html");
  });

  it("accept keeps the revision (canUndo) ; reject reverts to base", async () => {
    const rev: CompositionRevision = { id: "rev-1", compositionIndexUrl: "/rev1/index.html" };
    const { result } = renderHook(() => useCompositionEditFlow({ jobId: "j", client: clientReturning(rev), baseRevision: base }));
    await act(async () => { await result.current.submit("x", []); });
    act(() => result.current.accept());
    expect(result.current.isPreviewing).toBe(false);
    expect(result.current.currentCompositionUrl).toBe("/rev1/index.html");
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.currentCompositionUrl).toBe("/base/index.html");
    expect(result.current.canUndo).toBe(false);
  });

  it("reject discards the pending revision", async () => {
    const rev: CompositionRevision = { id: "rev-1", compositionIndexUrl: "/rev1/index.html" };
    const { result } = renderHook(() => useCompositionEditFlow({ jobId: "j", client: clientReturning(rev), baseRevision: base }));
    await act(async () => { await result.current.submit("x", []); });
    act(() => result.current.reject());
    expect(result.current.isPreviewing).toBe(false);
    expect(result.current.currentCompositionUrl).toBe("/base/index.html");
    expect(result.current.canUndo).toBe(false);
  });

  it("surfaces an error and does not change the current composition", async () => {
    const { result } = renderHook(() => useCompositionEditFlow({ jobId: "j", client: clientRejecting("boom"), baseRevision: base }));
    await act(async () => { await result.current.submit("x", []); });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("boom");
    expect(result.current.currentCompositionUrl).toBe("/base/index.html");
  });

  it("ignores an empty instruction", async () => {
    const { result } = renderHook(() => useCompositionEditFlow({ jobId: "j", client: clientReturning(base), baseRevision: base }));
    await act(async () => { await result.current.submit("   ", []); });
    expect(result.current.status).toBe("idle");
  });
});
