# Phase 2a — Composition editor shell + selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the composition editor inside the legacy porcelain shell (app bar · preview stage · playback bar · timeline · right Chat panel frame), add drag-to-select-range on the timeline, and turn a range/clip selection into removable context chips — with **no AI yet**.

**Architecture:** Reuse the model-agnostic layout of `apps/web/src/screens/Editor/EditorScreen.tsx` (the `videoeditor.png` reference) but drive the **composition** (`CompositionPreview` + `CompositionTimeline`) instead of a `DemoProject`. Playback advances a `currentTime` state via `requestAnimationFrame`; `CompositionPreview` already seeks declaratively on its `currentTime` prop. Selection is a new `CompositionSelection` type emitted by the timeline; a `ChatContextRef` is built from it for the chat composer. The legacy editor, `@tinker/ai-edit-ui`, and `DemoProject` are never imported or modified.

**Tech Stack:** React 18, TypeScript (strict), Vite, Vitest + jsdom + @testing-library/react. Spec: `docs/superpowers/specs/2026-06-14-composition-ai-edit-phase2-design.md`.

---

## File Structure

**Create:**
- `packages/editor/src/composition/selection.ts` — `CompositionSelection` type + `rangeSelection`/`clipSelection` constructors.
- `packages/editor/src/composition/selection.test.ts`
- `packages/editor/src/timeline/formatTimecode.ts` — shared `m:ss.s` formatter (extracted from the legacy private copy).
- `packages/editor/src/timeline/formatTimecode.test.ts`
- `apps/web/src/lib/chatContext.ts` — `ChatContextRef` type + `chatContextRefFromSelection` + `formatContextLabel`.
- `apps/web/src/lib/chatContext.test.ts`
- `apps/web/src/screens/CompositionEditor/useCompositionPlayback.ts` — rAF play/pause/seek over `currentTime`.
- `apps/web/src/screens/CompositionEditor/useCompositionPlayback.test.ts`
- `apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.tsx` — presentational playback bar.
- `apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.test.tsx`
- `apps/web/src/screens/CompositionEditor/CompositionChatPanel.tsx` — right-side composer + chips + (disabled) send.
- `apps/web/src/screens/CompositionEditor/CompositionChatPanel.test.tsx`

**Modify:**
- `packages/editor/src/composition/CompositionTimeline.tsx` — add `selection`/`onSelectRange` + drag handlers + selection band; keep click-seek/clip-click green.
- `packages/editor/src/index.ts` — export `CompositionSelection`, the selection constructors, and `formatTimecode`.
- `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx` — rebuild in the porcelain shell, wiring playback + selection + chips. Keep its two existing tests green.

**Do NOT touch:** `apps/web/src/screens/Editor/**`, `packages/ai-edit-ui/**`, any `DemoProject`/`demo-assembly` code.

**Commands** (run from repo root):
- Editor pkg tests: `pnpm --filter @tinker/editor test`
- Web tests: `pnpm --filter @tinker/web test`
- Single file: `pnpm --filter @tinker/editor exec vitest run src/composition/selection.test.ts`
- Typecheck: `pnpm --filter @tinker/editor typecheck` and `pnpm --filter @tinker/web typecheck`

---

## Task 1: `CompositionSelection` type + constructors

> Named `CompositionSelection` (not `Selection`) to avoid shadowing the DOM `Selection` global.

**Files:**
- Create: `packages/editor/src/composition/selection.ts`
- Test: `packages/editor/src/composition/selection.test.ts`
- Modify: `packages/editor/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/editor/src/composition/selection.test.ts
import { describe, expect, it } from "vitest";
import { rangeSelection, clipSelection } from "./selection.js";
import type { CompositionClip } from "./compositionTimelineModel.js";

describe("CompositionSelection constructors", () => {
  it("rangeSelection normalizes start/end order", () => {
    expect(rangeSelection(7.8, 4.2)).toEqual({ kind: "range", start: 4.2, end: 7.8 });
    expect(rangeSelection(1, 3)).toEqual({ kind: "range", start: 1, end: 3 });
  });

  it("clipSelection carries id, bounds, and label", () => {
    const clip: CompositionClip = { id: "feature", label: "Feature", start: 4, end: 10 };
    expect(clipSelection(clip)).toEqual({
      kind: "clip",
      clipId: "feature",
      label: "Feature",
      start: 4,
      end: 10,
    });
  });

  it("clipSelection omits label when the clip has none", () => {
    const clip: CompositionClip = { id: "clip-0", start: 0, end: 4 };
    expect(clipSelection(clip)).toEqual({ kind: "clip", clipId: "clip-0", start: 0, end: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor exec vitest run src/composition/selection.test.ts`
Expected: FAIL — cannot find module `./selection.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/editor/src/composition/selection.ts
import type { CompositionClip } from "./compositionTimelineModel.js";

/** A user selection on the composition timeline: a time range or a named clip. */
export type CompositionSelection =
  | { kind: "range"; start: number; end: number }
  | { kind: "clip"; clipId: string; label?: string; start: number; end: number };

/** Build a range selection, normalizing start/end order. */
export function rangeSelection(a: number, b: number): CompositionSelection {
  return { kind: "range", start: Math.min(a, b), end: Math.max(a, b) };
}

/** Build a clip selection from a timeline clip. */
export function clipSelection(clip: CompositionClip): CompositionSelection {
  return {
    kind: "clip",
    clipId: clip.id,
    start: clip.start,
    end: clip.end,
    ...(clip.label === undefined ? {} : { label: clip.label }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor exec vitest run src/composition/selection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from the package barrel**

Add to `packages/editor/src/index.ts` (after the existing `CompositionTimeline` export block near line 74-75):

```ts
export type { CompositionSelection } from "./composition/selection.js";
export { rangeSelection, clipSelection } from "./composition/selection.js";
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @tinker/editor typecheck`
Expected: clean.

```bash
git add packages/editor/src/composition/selection.ts packages/editor/src/composition/selection.test.ts packages/editor/src/index.ts
git commit -m "feat(editor): CompositionSelection type + range/clip constructors"
```

---

## Task 2: `formatTimecode` shared util

**Files:**
- Create: `packages/editor/src/timeline/formatTimecode.ts`
- Test: `packages/editor/src/timeline/formatTimecode.test.ts`
- Modify: `packages/editor/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/editor/src/timeline/formatTimecode.test.ts
import { describe, expect, it } from "vitest";
import { formatTimecode } from "./formatTimecode.js";

describe("formatTimecode", () => {
  it("formats seconds as m:ss.s", () => {
    expect(formatTimecode(3.2)).toBe("0:03.2");
    expect(formatTimecode(0)).toBe("0:00.0");
    expect(formatTimecode(72.45)).toBe("1:12.5");
  });

  it("clamps non-finite or negative input to zero", () => {
    expect(formatTimecode(-5)).toBe("0:00.0");
    expect(formatTimecode(Number.NaN)).toBe("0:00.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor exec vitest run src/timeline/formatTimecode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** (lifted verbatim from `EditorScreen.tsx:40-47`)

```ts
// packages/editor/src/timeline/formatTimecode.ts
/** Format seconds as `m:ss.s` (e.g. 3.2 → "0:03.2"). */
export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  const rounded = remainder.toFixed(1);
  const padded = parseFloat(rounded) < 10 ? `0${rounded}` : rounded;
  return `${minutes}:${padded}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor exec vitest run src/timeline/formatTimecode.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the barrel**

Add to `packages/editor/src/index.ts` (near the other `timeline/` exports, line 5-8):

```ts
export { formatTimecode } from "./timeline/formatTimecode.js";
```

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/timeline/formatTimecode.ts packages/editor/src/timeline/formatTimecode.test.ts packages/editor/src/index.ts
git commit -m "feat(editor): shared formatTimecode util"
```

> Note: leave the private copy in `EditorScreen.tsx` untouched (non-destructive). This util is for the composition playback bar.

---

## Task 3: Drag-to-select-range in `CompositionTimeline`

**Files:**
- Modify: `packages/editor/src/composition/CompositionTimeline.tsx`
- Test: `packages/editor/src/composition/CompositionTimeline.test.tsx` (append cases)

Add two props and drag handlers. **Click/drag disambiguation:** a press-move-release past a pixel threshold is a range drag (emits `onSelectRange`, suppresses the trailing click); a press-release without movement is a click (existing `onSeek`). Clicks on a clip keep working (clip `onMouseDown` stops propagation so it never starts a track drag).

- [ ] **Step 1: Write the failing tests** (append to the `CompositionTimeline (interaction)` describe block)

```ts
  it("emits a normalized range when the track is dragged, and renders a band", () => {
    const onSelectRange = vi.fn();
    const onSeek = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} onSelectRange={onSelectRange} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.mouseDown(track, { clientX: 600 });
    fireEvent.mouseMove(track, { clientX: 200 });
    fireEvent.mouseUp(track, { clientX: 200 });
    expect(onSelectRange).toHaveBeenCalledWith({ start: 2, end: 6 }); // normalized
    // the browser fires a click after a drag — it must NOT seek
    fireEvent.click(track, { clientX: 200 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("treats a press with no movement as a click (still seeks)", () => {
    const onSelectRange = vi.fn();
    const onSeek = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} onSelectRange={onSelectRange} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.mouseDown(track, { clientX: 500 });
    fireEvent.mouseUp(track, { clientX: 500 });
    fireEvent.click(track, { clientX: 500 });
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(onSeek).toHaveBeenCalledWith(5);
  });

  it("renders a controlled selection band from the selection prop", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} selection={{ start: 2, end: 6 }} />);
    expect(screen.getByTestId("composition-selection-band")).toHaveStyle({ left: "20%", width: "40%" });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tinker/editor exec vitest run src/composition/CompositionTimeline.test.tsx`
Expected: FAIL — `onSelectRange`/`selection` not handled; no `composition-selection-band`.

- [ ] **Step 3: Implement.** Update `CompositionTimeline.tsx`:

Extend props:

```ts
export type CompositionTimelineProps = {
  model: CompositionTimelineModel;
  currentTime: number;
  selectedClipId?: string;
  /** Controlled range-selection band, in seconds. */
  selection?: { start: number; end: number };
  onSeek?: (time: number) => void;
  onSelectClip?: (clip: CompositionClip) => void;
  /** Emitted when the user drags out a range on the track. */
  onSelectRange?: (range: { start: number; end: number }) => void;
};
```

Inside the component, add refs/state and a px→seconds helper, replacing the single `handleTrackClick`. **Extend the existing `react` import on line 1** (add `useRef`, `useState`) — do NOT add a second `import ... from "react"` line (redeclaration error):

```ts
// line 1 becomes:
import { useRef, useState, type CSSProperties, type MouseEvent } from "react";

const DRAG_THRESHOLD_PX = 4;

// ...inside CompositionTimeline:
const dragRef = useRef<{ startTime: number; startX: number; moved: boolean } | null>(null);
const suppressClickRef = useRef(false);
const [liveRange, setLiveRange] = useState<{ start: number; end: number } | null>(null);

function timeAt(event: MouseEvent<HTMLDivElement>, el: HTMLDivElement): number {
  const bounds = el.getBoundingClientRect();
  return createTimeScale(model.durationSeconds, Math.max(1, bounds.width)).pixelsToSeconds(event.clientX - bounds.left);
}

function handleTrackMouseDown(event: MouseEvent<HTMLDivElement>) {
  if (!onSelectRange) return;
  const el = event.currentTarget;
  dragRef.current = { startTime: timeAt(event, el), startX: event.clientX, moved: false };
}

function handleTrackMouseMove(event: MouseEvent<HTMLDivElement>) {
  const drag = dragRef.current;
  if (!drag) return;
  if (Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX) drag.moved = true;
  if (drag.moved) {
    const t = timeAt(event, event.currentTarget);
    setLiveRange({ start: Math.min(drag.startTime, t), end: Math.max(drag.startTime, t) });
  }
}

function handleTrackMouseUp(event: MouseEvent<HTMLDivElement>) {
  const drag = dragRef.current;
  dragRef.current = null;
  setLiveRange(null);
  if (!drag || !drag.moved) return;
  const end = timeAt(event, event.currentTarget);
  suppressClickRef.current = true;
  onSelectRange?.({ start: Math.min(drag.startTime, end), end: Math.max(drag.startTime, end) });
}

function handleTrackClick(event: MouseEvent<HTMLDivElement>) {
  if (suppressClickRef.current) { suppressClickRef.current = false; return; }
  if (!onSeek) return;
  onSeek(timeAt(event, event.currentTarget));
}
```

Wire the track element:

```tsx
<div
  data-testid="composition-timeline"
  aria-label="Composition timeline"
  style={trackStyle}
  onMouseDown={handleTrackMouseDown}
  onMouseMove={handleTrackMouseMove}
  onMouseUp={handleTrackMouseUp}
  onClick={handleTrackClick}
>
```

Add `onMouseDown` propagation-stop to each clip so pressing a clip never starts a track drag (in `handleClipClick`'s element):

```tsx
<div
  key={clip.id}
  ...
  onMouseDown={(event) => event.stopPropagation()}
  onClick={(event) => handleClipClick(event, clip)}
>
```

Render the band (live drag takes precedence over the controlled prop), just before the playhead:

```tsx
{(liveRange ?? selection) ? (
  <div
    data-testid="composition-selection-band"
    style={{
      position: "absolute",
      top: 0,
      bottom: 0,
      left: `${scale.secondsToPixels((liveRange ?? selection)!.start)}%`,
      width: `${scale.secondsToPixels((liveRange ?? selection)!.end) - scale.secondsToPixels((liveRange ?? selection)!.start)}%`,
      background: "var(--tk-accent-soft, rgba(108,140,255,0.22))",
      border: "1px solid var(--tk-accent, #6C8CFF)",
      borderRadius: 4,
      pointerEvents: "none",
    }}
  />
) : null}
```

- [ ] **Step 4: Run all timeline tests**

Run: `pnpm --filter @tinker/editor exec vitest run src/composition/CompositionTimeline.test.tsx`
Expected: PASS — new cases plus the pre-existing click-seek and clip-click cases (lines 80-99) all green.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @tinker/editor typecheck`

```bash
git add packages/editor/src/composition/CompositionTimeline.tsx packages/editor/src/composition/CompositionTimeline.test.tsx
git commit -m "feat(editor): CompositionTimeline drag-to-select range + selection band"
```

---

## Task 4: `ChatContextRef` + builder

**Files:**
- Create: `apps/web/src/lib/chatContext.ts`
- Test: `apps/web/src/lib/chatContext.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/chatContext.test.ts
import { describe, expect, it } from "vitest";
import { chatContextRefFromSelection, formatContextLabel } from "./chatContext.js";

describe("chatContextRefFromSelection", () => {
  it("builds a range ref", () => {
    expect(chatContextRefFromSelection({ kind: "range", start: 4.2, end: 7.8 }, "r1")).toEqual({
      id: "r1",
      kind: "range",
      start: 4.2,
      end: 7.8,
    });
  });

  it("builds a clip ref with id + label", () => {
    expect(
      chatContextRefFromSelection({ kind: "clip", clipId: "feature", label: "Feature", start: 4, end: 10 }, "c1"),
    ).toEqual({ id: "c1", kind: "clip", clipId: "feature", label: "Feature", start: 4, end: 10 });
  });
});

describe("formatContextLabel", () => {
  it("formats a range as seconds", () => {
    expect(formatContextLabel({ id: "r1", kind: "range", start: 4.2, end: 7.84 })).toBe("4.2s–7.8s");
  });
  it("uses the clip label, falling back to the clip id", () => {
    expect(formatContextLabel({ id: "c1", kind: "clip", clipId: "feature", label: "Feature", start: 4, end: 10 })).toBe("Feature");
    expect(formatContextLabel({ id: "c2", kind: "clip", clipId: "scene-2", start: 4, end: 10 })).toBe("scene-2");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tinker/web exec vitest run src/lib/chatContext.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/chatContext.ts
import type { CompositionSelection } from "@tinker/editor";

/** A scoped reference attached to a chat instruction (matches POST /api/jobs/:id/edits context items). */
export type ChatContextRef = {
  id: string;
  kind: "range" | "clip";
  start: number;
  end: number;
  clipId?: string;
  label?: string;
};

/** Build a ChatContextRef from a timeline selection. `id` must be caller-unique. */
export function chatContextRefFromSelection(selection: CompositionSelection, id: string): ChatContextRef {
  if (selection.kind === "clip") {
    return {
      id,
      kind: "clip",
      start: selection.start,
      end: selection.end,
      clipId: selection.clipId,
      ...(selection.label === undefined ? {} : { label: selection.label }),
    };
  }
  return { id, kind: "range", start: selection.start, end: selection.end };
}

/** Human-readable chip label, e.g. "4.2s–7.8s" or a clip's label. */
export function formatContextLabel(ref: ChatContextRef): string {
  if (ref.kind === "clip") return ref.label ?? ref.clipId ?? "clip";
  return `${ref.start.toFixed(1)}s–${ref.end.toFixed(1)}s`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tinker/web exec vitest run src/lib/chatContext.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/chatContext.ts apps/web/src/lib/chatContext.test.ts
git commit -m "feat(web): ChatContextRef + builder from composition selection"
```

---

## Task 5: `useCompositionPlayback` hook (rAF play/pause/seek)

**Files:**
- Create: `apps/web/src/screens/CompositionEditor/useCompositionPlayback.ts`
- Test: `apps/web/src/screens/CompositionEditor/useCompositionPlayback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/screens/CompositionEditor/useCompositionPlayback.test.ts
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionPlayback } from "./useCompositionPlayback.js";

afterEach(() => vi.unstubAllGlobals());

function stubRaf() {
  const cbs: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cbs.push(cb); return cbs.length; });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  return cbs;
}

describe("useCompositionPlayback", () => {
  it("advances currentTime while playing", () => {
    const cbs = stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(10));
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    act(() => cbs.shift()?.(0));     // first frame seeds the clock
    act(() => cbs.shift()?.(1000));  // +1.0s
    expect(result.current.currentTime).toBeCloseTo(1, 3);
  });

  it("seek sets currentTime and clamps to [0, duration]", () => {
    stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(10));
    act(() => result.current.seek(4));
    expect(result.current.currentTime).toBe(4);
    act(() => result.current.seek(99));
    expect(result.current.currentTime).toBe(10);
    act(() => result.current.seek(-3));
    expect(result.current.currentTime).toBe(0);
  });

  it("stops at the end and clears isPlaying", () => {
    const cbs = stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(1));
    act(() => result.current.play());
    act(() => cbs.shift()?.(0));
    act(() => cbs.shift()?.(2000)); // overshoots 1s duration
    expect(result.current.currentTime).toBe(1);
    expect(result.current.isPlaying).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/useCompositionPlayback.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (ports the rAF loop from `EditorScreen.tsx:426-470`)

```ts
// apps/web/src/screens/CompositionEditor/useCompositionPlayback.ts
import { useCallback, useEffect, useRef, useState } from "react";

export type CompositionPlayback = {
  currentTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
};

/** rAF-driven playhead for the composition preview. Advances `currentTime`, which the preview seeks to. */
export function useCompositionPlayback(duration: number): CompositionPlayback {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const currentRef = useRef(currentTime);
  currentRef.current = currentTime;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isPlaying || typeof requestAnimationFrame !== "function") {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastRef.current = null;
      return;
    }
    function tick(ts: number) {
      if (!mountedRef.current) return;
      if (lastRef.current === null) lastRef.current = ts;
      const delta = (ts - lastRef.current) / 1000;
      lastRef.current = ts;
      const next = Math.min(currentRef.current + delta, duration);
      setCurrentTime(next);
      if (next >= duration) { setIsPlaying(false); lastRef.current = null; return; }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastRef.current = null;
    };
  }, [isPlaying, duration]);

  const play = useCallback(() => {
    setCurrentTime((t) => (duration > 0 && t >= duration ? 0 : t));
    setIsPlaying(true);
  }, [duration]);
  const pause = useCallback(() => setIsPlaying(false), []);
  const seek = useCallback(
    (time: number) => setCurrentTime(Math.max(0, Math.min(time, duration > 0 ? duration : 0))),
    [duration],
  );

  return { currentTime, isPlaying, play, pause, seek };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/useCompositionPlayback.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/useCompositionPlayback.ts apps/web/src/screens/CompositionEditor/useCompositionPlayback.test.ts
git commit -m "feat(web): useCompositionPlayback rAF hook (play/pause/seek)"
```

---

## Task 6: `CompositionPlaybackBar` (presentational)

**Files:**
- Create: `apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.tsx`
- Test: `apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.test.tsx`

Presentational only — no rAF. Renders play/pause + prev/next + `currentTime / duration` timecode. The owner computes `canPrev`/`canNext` (clip boundaries) and passes handlers.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionPlaybackBar } from "./CompositionPlaybackBar.js";

const base = {
  currentTime: 2,
  duration: 24,
  isPlaying: false,
  canPrev: true,
  canNext: true,
  onPlayPause: () => undefined,
  onPrev: () => undefined,
  onNext: () => undefined,
};

describe("CompositionPlaybackBar", () => {
  it("renders the timecode as m:ss.s / m:ss.s", () => {
    render(<CompositionPlaybackBar {...base} />);
    expect(screen.getByLabelText("Timecode")).toHaveTextContent("0:02.0 / 0:24.0");
  });

  it("toggles the play/pause label", () => {
    const onPlayPause = vi.fn();
    const { rerender } = render(<CompositionPlaybackBar {...base} onPlayPause={onPlayPause} />);
    const btn = screen.getByRole("button", { name: "Play" });
    fireEvent.click(btn);
    expect(onPlayPause).toHaveBeenCalledTimes(1);
    rerender(<CompositionPlaybackBar {...base} isPlaying onPlayPause={onPlayPause} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("disables prev/next per canPrev/canNext", () => {
    render(<CompositionPlaybackBar {...base} canPrev={false} canNext={false} />);
    expect(screen.getByRole("button", { name: "Previous clip" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next clip" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/CompositionPlaybackBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (reuse `tk-iconbtn`, `tk-play`, `tk-timecode`; mirror the legacy playback bar markup at `EditorScreen.tsx:863-944`, minus undo/redo/trash which belong to the edit flow in 2b)

```tsx
// apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.tsx
import { type CSSProperties } from "react";
import { formatTimecode } from "@tinker/editor";

export type CompositionPlaybackBarProps = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
};

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: "var(--tk-radius-md)",
  background: "var(--tk-raised)",
  border: "1px solid var(--tk-border)",
};

export function CompositionPlaybackBar({
  currentTime, duration, isPlaying, canPrev, canNext, onPlayPause, onPrev, onNext,
}: CompositionPlaybackBarProps) {
  return (
    <section aria-label="Playback controls" style={barStyle}>
      <button type="button" className="tk-iconbtn" aria-label="Previous clip" disabled={!canPrev} onClick={onPrev}>‹</button>
      <button type="button" className="tk-play" aria-label={isPlaying ? "Pause" : "Play"} onClick={onPlayPause}>
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <button type="button" className="tk-iconbtn" aria-label="Next clip" disabled={!canNext} onClick={onNext}>›</button>
      <span className="tk-timecode" aria-label="Timecode">
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
      </span>
    </section>
  );
}
```

> The glyphs above are placeholders for legibility; if you want pixel parity with `videoeditor.png`, copy the inline SVG `PrevIcon`/`PlayIcon`/`PauseIcon`/`NextIcon` from `EditorScreen.tsx:97-130` instead. Either way the `aria-label`s must stay exactly "Play"/"Pause"/"Previous clip"/"Next clip" for the tests.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/CompositionPlaybackBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.tsx apps/web/src/screens/CompositionEditor/CompositionPlaybackBar.test.tsx
git commit -m "feat(web): CompositionPlaybackBar (play/pause/prev/next/timecode)"
```

---

## Task 7: `CompositionChatPanel` (composer + chips + disabled send)

**Files:**
- Create: `apps/web/src/screens/CompositionEditor/CompositionChatPanel.tsx`
- Test: `apps/web/src/screens/CompositionEditor/CompositionChatPanel.test.tsx`

The right-panel frame. In 2a there is **no send** (the button is disabled with a "coming in 2b" title). It shows: an "+ Add selection to chat" button (disabled unless a selection exists), the context chips (removable), and the instruction textarea.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/screens/CompositionEditor/CompositionChatPanel.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionChatPanel } from "./CompositionChatPanel.js";
import type { ChatContextRef } from "../../lib/chatContext.js";

const refs: ChatContextRef[] = [
  { id: "a", kind: "range", start: 2, end: 6 },
  { id: "b", kind: "clip", clipId: "feature", label: "Feature", start: 6, end: 10 },
];

function props(over = {}) {
  return {
    instruction: "",
    onInstructionChange: () => undefined,
    contextRefs: refs,
    onRemoveRef: () => undefined,
    hasSelection: true,
    onAddToChat: () => undefined,
    ...over,
  };
}

describe("CompositionChatPanel", () => {
  it("renders a chip per context ref with its label", () => {
    render(<CompositionChatPanel {...props()} />);
    expect(screen.getByText("2.0s–6.0s")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
  });

  it("removes a chip", () => {
    const onRemoveRef = vi.fn();
    render(<CompositionChatPanel {...props({ onRemoveRef })} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove 2.0s–6.0s from chat" }));
    expect(onRemoveRef).toHaveBeenCalledWith("a");
  });

  it("enables Add to chat only with a selection", () => {
    const onAddToChat = vi.fn();
    const { rerender } = render(<CompositionChatPanel {...props({ hasSelection: false, onAddToChat })} />);
    expect(screen.getByRole("button", { name: "Add selection to chat" })).toBeDisabled();
    rerender(<CompositionChatPanel {...props({ hasSelection: true, onAddToChat })} />);
    fireEvent.click(screen.getByRole("button", { name: "Add selection to chat" }));
    expect(onAddToChat).toHaveBeenCalledTimes(1);
  });

  it("disables send in 2a", () => {
    render(<CompositionChatPanel {...props()} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/CompositionChatPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (reuse `tk-chip`, `tk-send`, `tk-input`; panel chrome mirrors the right `aside` at `EditorScreen.tsx:960-986`)

```tsx
// apps/web/src/screens/CompositionEditor/CompositionChatPanel.tsx
import { type CSSProperties } from "react";
import { type ChatContextRef, formatContextLabel } from "../../lib/chatContext.js";

export type CompositionChatPanelProps = {
  instruction: string;
  onInstructionChange: (value: string) => void;
  contextRefs: ChatContextRef[];
  onRemoveRef: (id: string) => void;
  hasSelection: boolean;
  onAddToChat: () => void;
  /** 2b wires this; absent/false in 2a keeps Send disabled. */
  onSend?: () => void;
};

const panelStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  minHeight: 0,
  height: "100%",
  background: "var(--tk-panel-bg)",
  borderLeft: "1px solid var(--tk-border)",
  padding: 12,
  gap: 10,
};

export function CompositionChatPanel({
  instruction, onInstructionChange, contextRefs, onRemoveRef, hasSelection, onAddToChat, onSend,
}: CompositionChatPanelProps) {
  return (
    <aside aria-label="Chat" style={panelStyle}>
      <button type="button" className="tk-btn" aria-label="Add selection to chat" disabled={!hasSelection} onClick={onAddToChat}>
        + Add selection to chat
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignContent: "flex-start", overflow: "auto", minHeight: 0 }}>
        {contextRefs.map((ref) => {
          const label = formatContextLabel(ref);
          return (
            <span key={ref.id} className="tk-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {label}
              <button type="button" aria-label={`Remove ${label} from chat`} onClick={() => onRemoveRef(ref.id)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            </span>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          className="tk-input"
          aria-label="Edit instruction"
          placeholder="Ask Tinker to edit the demo…"
          value={instruction}
          onChange={(e) => onInstructionChange(e.currentTarget.value)}
          rows={3}
        />
        <button
          type="button"
          className="tk-send"
          aria-label="Send (coming in Phase 2b)"
          disabled={onSend === undefined}
          title={onSend === undefined ? "AI editing arrives in Phase 2b" : "Send"}
          onClick={onSend}
        >
          Send
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/CompositionChatPanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/CompositionChatPanel.tsx apps/web/src/screens/CompositionEditor/CompositionChatPanel.test.tsx
git commit -m "feat(web): CompositionChatPanel frame — composer + chips + disabled send"
```

---

## Task 8: Rebuild `CompositionEditorScreen` in the porcelain shell

**Files:**
- Modify: `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx`
- Test: `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx` (keep the two existing cases green; add shell + chip cases)

Compose everything: app bar (Tinker Studio · Export-stub) over a body grid `minmax(0,1fr) 320px` — left column = preview stage / playback bar / timeline; right column = `CompositionChatPanel`. State: `useCompositionPlayback(duration)`, `selection`, `contextRefs`.

- [ ] **Step 1: Write/extend the failing tests**

Keep the existing two tests (lines 24-55) unchanged. Add:

```tsx
  it("renders the porcelain shell: app bar + playback bar + chat panel", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByLabelText("Playback controls")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add selection to chat" })).toBeDisabled();
  });

  it("adds a clip selection to chat as a chip", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("composition-clip-feature")); // selects clip "feature" (4–10)
    fireEvent.click(screen.getByRole("button", { name: "Add selection to chat" }));
    // Assert via the chip's remove button — "feature" text also appears on the timeline clip,
    // so getByText("feature") would match two nodes.
    expect(screen.getByRole("button", { name: "Remove feature from chat" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`
Expected: FAIL — no Export button / Playback controls / Chat / Add-to-chat yet.

- [ ] **Step 3: Implement the rebuild**

Replace the body of `CompositionEditorScreen.tsx` with the shell. Key wiring (full component):

```tsx
import { useMemo, useState, type CSSProperties } from "react";
import {
  CompositionPreview,
  CompositionTimeline,
  clipSelection,
  rangeSelection,
  type CompositionClip,
  type CompositionSelection,
  type CompositionTimelineModel,
  type TimelineRegistryWindow,
} from "@tinker/editor";
import { chatContextRefFromSelection, type ChatContextRef } from "../../lib/chatContext.js";
import { useCompositionPlayback } from "./useCompositionPlayback.js";
import { CompositionPlaybackBar } from "./CompositionPlaybackBar.js";
import { CompositionChatPanel } from "./CompositionChatPanel.js";

export type CompositionEditorScreenProps = {
  compositionIndexUrl: string;
  outputVideoUrl?: string;
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const shellStyle: CSSProperties = {
  height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "52px minmax(0,1fr)",
  background: "var(--tk-app-bg)", color: "var(--tk-text)", fontFamily: "var(--tk-font)",
};
const barStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "0 14px",
  borderBottom: "1px solid var(--tk-border)", background: "var(--tk-card)",
};
const bodyStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", minHeight: 0 };
const leftColStyle: CSSProperties = { display: "grid", gridTemplateRows: "minmax(0,1fr) auto auto", minHeight: 0, padding: 14, gap: 12 };
const stageStyle: CSSProperties = {
  position: "relative", minHeight: 0, borderRadius: 18, overflow: "hidden",
  background: "var(--tk-preview-bg)", display: "flex", alignItems: "center", justifyContent: "center",
};

export function CompositionEditorScreen({ compositionIndexUrl, outputVideoUrl, resolveWindow }: CompositionEditorScreenProps) {
  const [model, setModel] = useState<CompositionTimelineModel | undefined>(undefined);
  const [selection, setSelection] = useState<CompositionSelection | undefined>(undefined);
  const [contextRefs, setContextRefs] = useState<ChatContextRef[]>([]);
  const [instruction, setInstruction] = useState("");
  const [refSeq, setRefSeq] = useState(0);

  const duration = model?.durationSeconds ?? 0;
  const playback = useCompositionPlayback(duration);

  const clips = model?.clips ?? [];
  const starts = useMemo(() => Array.from(new Set(clips.map((c) => c.start))).sort((a, b) => a - b), [clips]);
  const prev = [...starts].reverse().find((s) => s < playback.currentTime - 1e-6);
  const next = starts.find((s) => s > playback.currentTime + 1e-6);

  const selectedClipId = selection?.kind === "clip" ? selection.clipId : undefined;
  const band = selection ? { start: selection.start, end: selection.end } : undefined;

  function handleSelectClip(clip: CompositionClip) { setSelection(clipSelection(clip)); }
  function handleSelectRange(range: { start: number; end: number }) { setSelection(rangeSelection(range.start, range.end)); }

  function handleAddToChat() {
    if (!selection) return;
    const id = `ref-${refSeq}`;
    setRefSeq((n) => n + 1);
    setContextRefs((refs) => [...refs, chatContextRefFromSelection(selection, id)]);
  }
  function handleRemoveRef(id: string) { setContextRefs((refs) => refs.filter((r) => r.id !== id)); }

  return (
    <div className="tk-porcelain" style={shellStyle}>
      <header style={barStyle}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Tinker</span>
        <span style={{ fontSize: 14, color: "var(--tk-text-sec)" }}>Studio</span>
        <div style={{ marginLeft: "auto" }}>
          <button type="button" className="tk-btn tk-btn-accent" aria-label="Export" title="Export (coming soon)" disabled>
            Export
          </button>
        </div>
      </header>

      <div style={bodyStyle}>
        <div style={leftColStyle}>
          <section aria-label="Preview stage" style={stageStyle}>
            <CompositionPreview
              src={compositionIndexUrl}
              currentTime={playback.currentTime}
              fallbackVideoSrc={outputVideoUrl}
              onReady={(readyModel) => setModel(readyModel)}
              resolveWindow={resolveWindow}
            />
          </section>

          {model ? (
            <CompositionPlaybackBar
              currentTime={playback.currentTime}
              duration={duration}
              isPlaying={playback.isPlaying}
              canPrev={prev !== undefined}
              canNext={next !== undefined}
              onPlayPause={() => (playback.isPlaying ? playback.pause() : playback.play())}
              onPrev={() => prev !== undefined && playback.seek(prev)}
              onNext={() => next !== undefined && playback.seek(next)}
            />
          ) : null}

          {model ? (
            <CompositionTimeline
              model={model}
              currentTime={playback.currentTime}
              selectedClipId={selectedClipId}
              selection={band}
              onSeek={playback.seek}
              onSelectClip={handleSelectClip}
              onSelectRange={handleSelectRange}
            />
          ) : null}
        </div>

        <CompositionChatPanel
          instruction={instruction}
          onInstructionChange={setInstruction}
          contextRefs={contextRefs}
          onRemoveRef={handleRemoveRef}
          hasSelection={selection !== undefined}
          onAddToChat={handleAddToChat}
        />
      </div>
    </div>
  );
}
```

> The app-bar wordmark + Export button are intentionally minimal; for closer parity with `videoeditor.png` copy the header markup from `EditorScreen.tsx:626-733` (filename chip, gear, Preview) — but keep `aria-label="Export"` for the test. The `CompositionDemoScreen` already wraps this screen with its own Back button (`CompositionDemoScreen.tsx:25-48`), so no Back is added here.

- [ ] **Step 4: Run the screen tests + the full web + editor suites**

Run: `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`
Expected: PASS — the 2 original + 2 new cases.

Run: `pnpm --filter @tinker/editor test` and `pnpm --filter @tinker/web test`
Expected: all green (legacy `EditorScreen` tests included, untouched).

- [ ] **Step 5: Typecheck both packages**

Run: `pnpm --filter @tinker/editor typecheck` then `pnpm --filter @tinker/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx
git commit -m "feat(web): rebuild CompositionEditorScreen in the porcelain shell + selection→chips"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Shell (app bar/preview stage/playback bar/timeline/right panel) → Tasks 6, 7, 8. ✓
- Playback bar drives currentTime declaratively; flat-composition prev/next fallback (`prev`/`next` are `undefined` ⇒ disabled when `clips` empty) → Tasks 5, 8. ✓
- Drag-range select + click/drag disambiguation, click-seek/clip-click preserved → Task 3. ✓
- `CompositionSelection` in `@tinker/editor`; `ChatContextRef` in `apps/web/src/lib` → Tasks 1, 4. ✓
- Context chips (create/remove/multiple) → Tasks 4, 7, 8. ✓
- `formatTimecode` extracted to shared util (legacy copy untouched) → Task 2. ✓
- Non-destructive (no import/edit of `EditorScreen`/`ai-edit-ui`/`DemoProject`) → enforced in every task; legacy suites run green in Task 8 Step 4. ✓
- Send disabled in 2a (AI is 2b) → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code + test step has complete content.

**Type consistency:** `CompositionSelection` (range|clip), `ChatContextRef`, `CompositionPlayback`, `CompositionPlaybackBarProps`, `CompositionChatPanelProps` names/fields are consistent across Tasks 1→8. `onSelectRange`/`selection` prop names match between `CompositionTimeline` (Task 3) and its caller (Task 8). `formatTimecode`/`chatContextRefFromSelection`/`formatContextLabel` signatures match call sites.

**Out of scope (2b):** `MockCompositionEditClient`, `useCompositionEditFlow`, `CompositionEditRequest`/`Revision` types, Accept/Reject/Undo, live Send, threading `jobId` into the screen.
