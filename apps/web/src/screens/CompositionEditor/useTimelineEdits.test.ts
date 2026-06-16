import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CompositionTimelineModel } from "@tinker/editor";
import { useTimelineEdits } from "./useTimelineEdits.js";

const base: CompositionTimelineModel = {
  durationSeconds: 10,
  clips: [
    { id: "a", label: "A", start: 0, end: 5 },
    { id: "b", label: "B", start: 5, end: 10 },
  ],
  labels: [],
};

describe("useTimelineEdits", () => {
  it("splits, then undo/redo walks the history", () => {
    const { result } = renderHook(() => useTimelineEdits());

    act(() => result.current.reset(base));
    expect(result.current.model?.clips).toHaveLength(2);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.split(3));
    expect(result.current.model?.clips).toHaveLength(3);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(result.current.model?.clips).toHaveLength(2);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.model?.clips).toHaveLength(3);
  });

  it("delete + add marker are undoable; a new edit clears the redo future", () => {
    const { result } = renderHook(() => useTimelineEdits());
    act(() => result.current.reset(base));

    act(() => result.current.remove("a"));
    expect(result.current.model?.clips.map((c) => c.id)).toEqual(["b"]);

    act(() => result.current.mark(7, "Marker 1"));
    expect(result.current.model?.labels).toHaveLength(1);

    act(() => result.current.undo()); // undo marker
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.remove("b")); // new edit replaces the redo branch
    expect(result.current.canRedo).toBe(false);
    expect(result.current.model?.clips).toHaveLength(0);
  });

  it("reset clears history", () => {
    const { result } = renderHook(() => useTimelineEdits());
    act(() => result.current.reset(base));
    act(() => result.current.split(3));
    act(() => result.current.reset(base));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  const endOf = (m: CompositionTimelineModel | undefined, id: string) => m?.clips.find((c) => c.id === id)?.end;

  it("trims a clip edge as a single undoable/redoable edit", () => {
    const { result } = renderHook(() => useTimelineEdits());
    act(() => result.current.reset(base));

    act(() => result.current.trim("a", "end", 3)); // shorten clip a to 0–3
    expect(endOf(result.current.model, "a")).toBe(3);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(endOf(result.current.model, "a")).toBe(5); // back to the generated extent
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(endOf(result.current.model, "a")).toBe(3);
  });

  it("extends a shortened clip back toward its source bound", () => {
    const { result } = renderHook(() => useTimelineEdits());
    act(() => result.current.reset(base));
    act(() => result.current.trim("a", "end", 3));
    act(() => result.current.trim("a", "end", 4.5));
    expect(endOf(result.current.model, "a")).toBe(4.5);
  });

  it("creates, moves, resizes and deletes a zoom unit as undoable edits", () => {
    const { result } = renderHook(() => useTimelineEdits());
    act(() => result.current.reset(base));

    act(() => result.current.addZoom("z1", 2, 6));
    expect(result.current.model?.zooms).toEqual([{ id: "z1", start: 2, end: 6 }]);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.moveZoom("z1", 4));
    expect(result.current.model?.zooms).toEqual([{ id: "z1", start: 4, end: 8 }]);

    act(() => result.current.resizeZoom("z1", "end", 9));
    expect(result.current.model?.zooms).toEqual([{ id: "z1", start: 4, end: 9 }]);

    act(() => result.current.undo()); // undo the resize
    expect(result.current.model?.zooms).toEqual([{ id: "z1", start: 4, end: 8 }]);
    act(() => result.current.redo()); // redo the resize
    expect(result.current.model?.zooms).toEqual([{ id: "z1", start: 4, end: 9 }]);

    act(() => result.current.removeZoom("z1"));
    expect(result.current.model?.zooms).toEqual([]);
    act(() => result.current.undo()); // restore the deleted zoom
    expect(result.current.model?.zooms).toEqual([{ id: "z1", start: 4, end: 9 }]);
  });
});
