# Composition AI Editing — Phase 1c: Composition Timeline UI (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `CompositionTimeline` React component that renders a scrubbable track for a composition — clip segments, label markers, and a playhead — and emits `onSeek`/`onSelectClip` so it can drive `CompositionPreview`'s `currentTime`.

**Architecture:** The component renders from Phase 1a's `CompositionTimelineModel` (`{ durationSeconds, clips, labels }`). Positions are percentages computed by reusing the existing `createTimeScale(duration, 100)` (so `secondsToPixels(t)` returns a percent); click→time mapping reuses `createTimeScale(duration, bounds.width).pixelsToSeconds(...)` against the element's measured width — the same pattern the DemoProject `Timeline.tsx` uses. Display and interaction are separate tasks so the display is testable purely from inline-style positions, and the click mapping is tested with a mocked `getBoundingClientRect`.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), React 19, Vitest (jsdom) + `@testing-library/react`.

**Branch:** `person-b/composition-ai-edit` (continue; Phases 0/1a/1b on it).

**Spec:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md` (Component §3 CompositionTimeline; "Selection Granularity").

---

## Context this plan relies on (verified)

- Phase 1a (in `@tinker/editor`): types `CompositionTimelineModel` (`{ durationSeconds: number; clips: CompositionClip[]; labels: { name; time }[] }`) and `CompositionClip` (`{ id; label?; start; end }`).
- `packages/editor/src/timeline/timeScale.ts` exports `createTimeScale(duration, width): { secondsToPixels; pixelsToSeconds; clampTime }`. `secondsToPixels` clamps the time into `[0, duration]`, so `createTimeScale(duration, 100).secondsToPixels(t)` yields a clamped percent.
- Click→time pattern (from `Timeline.tsx`): `const b = el.getBoundingClientRect(); createTimeScale(duration, Math.max(1, b.width)).pixelsToSeconds(clientX - b.left)`.
- `packages/editor` tests run in jsdom with `@testing-library/react`. jsdom's `getBoundingClientRect` returns zeros by default, so the interaction test spies on it. Run one file: `pnpm --filter @tinker/editor test -- <path>`. Imports use `.js` specifiers.
- **Scope:** drag-to-select-range is intentionally deferred to Phase 2 (its only consumer is "add range to chat"); this phase ships display + click-to-seek + click-to-select-clip. A flat composition (no clips) still scrubs (range-only navigation).

---

## File Structure

- Create: `packages/editor/src/composition/CompositionTimeline.tsx` — the component (display in Task 1, interactions in Task 2).
- Create: `packages/editor/src/composition/CompositionTimeline.test.tsx` — display + interaction tests.
- Modify: `packages/editor/src/index.ts` — export the component + props type.

---

## Task 1: CompositionTimeline display (track, clips, labels, playhead)

**Files:**
- Create: `packages/editor/src/composition/CompositionTimeline.tsx`
- Test: `packages/editor/src/composition/CompositionTimeline.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/editor/src/composition/CompositionTimeline.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompositionTimeline } from "./CompositionTimeline.js";
import type { CompositionTimelineModel } from "./compositionTimelineModel.js";

const MODEL: CompositionTimelineModel = {
  durationSeconds: 10,
  clips: [
    { id: "hook", label: "hook", start: 0, end: 4 },
    { id: "feature", label: "feature", start: 4, end: 10 },
  ],
  labels: [{ name: "cta", time: 8 }],
};

describe("CompositionTimeline (display)", () => {
  it("renders each clip at the right left/width percent with its label", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} />);
    const hook = screen.getByTestId("composition-clip-hook");
    expect(hook).toHaveStyle({ left: "0%", width: "40%" });
    expect(hook).toHaveTextContent("hook");
    const feature = screen.getByTestId("composition-clip-feature");
    expect(feature).toHaveStyle({ left: "40%", width: "60%" });
  });

  it("renders label markers positioned by time", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} />);
    expect(screen.getByTestId("composition-label-cta")).toHaveStyle({ left: "80%" });
  });

  it("positions the playhead at currentTime", () => {
    render(<CompositionTimeline model={MODEL} currentTime={2.5} />);
    expect(screen.getByTestId("composition-playhead")).toHaveStyle({ left: "25%" });
  });

  it("marks the selected clip", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} selectedClipId="feature" />);
    expect(screen.getByTestId("composition-clip-feature")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("composition-clip-hook")).toHaveAttribute("data-selected", "false");
  });

  it("renders a scrubbable track with no clip segments for a flat composition", () => {
    render(<CompositionTimeline model={{ durationSeconds: 6, clips: [], labels: [] }} currentTime={3} />);
    expect(screen.getByTestId("composition-timeline")).toBeInTheDocument();
    expect(screen.queryByTestId(/composition-clip-/)).not.toBeInTheDocument();
    expect(screen.getByTestId("composition-playhead")).toHaveStyle({ left: "50%" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionTimeline.test.tsx`
Expected: FAIL — cannot find module `./CompositionTimeline.js`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/editor/src/composition/CompositionTimeline.tsx
import { type CSSProperties } from "react";
import { createTimeScale } from "../timeline/timeScale.js";
import type { CompositionClip, CompositionTimelineModel } from "./compositionTimelineModel.js";

export type CompositionTimelineProps = {
  model: CompositionTimelineModel;
  /** Current playhead time in seconds. */
  currentTime: number;
  /** Id of the currently selected clip, if any. */
  selectedClipId?: string;
  /** Seek to a time when the track is clicked (wired in Task 2). */
  onSeek?: (time: number) => void;
  /** Select a clip when it is clicked (wired in Task 2). */
  onSelectClip?: (clip: CompositionClip) => void;
};

const trackStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 56,
  background: "var(--tk-timeline-bg, #2B2A24)",
  borderRadius: 10,
  overflow: "hidden",
  userSelect: "none",
};

const clipStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  bottom: 8,
  display: "flex",
  alignItems: "center",
  paddingInline: 8,
  borderRadius: 6,
  background: "var(--tk-timeline-clip, #54503F)",
  color: "white",
  fontFamily: "var(--tk-font)",
  fontSize: 12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  boxSizing: "border-box",
};

const selectedClipStyle: CSSProperties = {
  outline: "2px solid var(--tk-accent, #6C8CFF)",
};

const labelStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  transform: "translateX(-50%)",
  color: "var(--tk-text-ter, #B8B4A4)",
  fontFamily: "var(--tk-mono)",
  fontSize: 10,
};

const playheadStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 2,
  transform: "translateX(-1px)",
  background: "var(--tk-accent, #6C8CFF)",
};

export function CompositionTimeline({ model, currentTime, selectedClipId }: CompositionTimelineProps) {
  const scale = createTimeScale(model.durationSeconds, 100);

  return (
    <div data-testid="composition-timeline" style={trackStyle}>
      {model.clips.map((clip) => {
        const left = scale.secondsToPixels(clip.start);
        const width = scale.secondsToPixels(clip.end) - left;
        const selected = clip.id === selectedClipId;
        return (
          <div
            key={clip.id}
            data-testid={`composition-clip-${clip.id}`}
            data-selected={selected ? "true" : "false"}
            style={{ ...clipStyle, ...(selected ? selectedClipStyle : {}), left: `${left}%`, width: `${width}%` }}
          >
            {clip.label ?? clip.id}
          </div>
        );
      })}
      {model.labels.map((label) => (
        <div
          key={label.name}
          data-testid={`composition-label-${label.name}`}
          style={{ ...labelStyle, left: `${scale.secondsToPixels(label.time)}%` }}
        >
          {label.name}
        </div>
      ))}
      <div data-testid="composition-playhead" style={{ ...playheadStyle, left: `${scale.secondsToPixels(currentTime)}%` }} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionTimeline.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/composition/CompositionTimeline.tsx packages/editor/src/composition/CompositionTimeline.test.tsx
git commit -m "feat(editor): CompositionTimeline display (clips, labels, playhead)"
```

---

## Task 2: Click-to-seek and click-to-select-clip

**Files:**
- Modify: `packages/editor/src/composition/CompositionTimeline.tsx`
- Test: `packages/editor/src/composition/CompositionTimeline.test.tsx` (add an interaction `describe`)

- [ ] **Step 1: Write the failing test** — append to `packages/editor/src/composition/CompositionTimeline.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

function mockBounds(el: HTMLElement, width: number, left = 0) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    width,
    top: 0,
    right: left + width,
    bottom: 56,
    height: 56,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("CompositionTimeline (interaction)", () => {
  it("seeks to the clicked time on the track", () => {
    const onSeek = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.click(track, { clientX: 500 });
    expect(onSeek).toHaveBeenCalledWith(5); // 500/1000 * 10s
  });

  it("selects a clip and seeks to its start when the clip is clicked, without a second track seek", () => {
    const onSeek = vi.fn();
    const onSelectClip = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} onSelectClip={onSelectClip} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    expect(onSelectClip).toHaveBeenCalledWith(MODEL.clips[1]);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(4); // feature.start
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionTimeline.test.tsx`
Expected: FAIL — `onSeek`/`onSelectClip` not called (handlers not yet wired).

- [ ] **Step 3: Wire the interactions** — update `CompositionTimeline.tsx`:

Change the component signature to destructure the callbacks:

```tsx
export function CompositionTimeline({ model, currentTime, selectedClipId, onSeek, onSelectClip }: CompositionTimelineProps) {
  const scale = createTimeScale(model.durationSeconds, 100);

  function handleTrackClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = createTimeScale(model.durationSeconds, Math.max(1, bounds.width)).pixelsToSeconds(event.clientX - bounds.left);
    onSeek(time);
  }

  function handleClipClick(event: React.MouseEvent<HTMLDivElement>, clip: CompositionClip) {
    event.stopPropagation();
    onSelectClip?.(clip);
    onSeek?.(clip.start);
  }
```

Add `import { type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";` is NOT needed — use `React.MouseEvent` via the default React types already available through the JSX runtime; if the type isn't resolvable, add `import type { MouseEvent } from "react";` and use `MouseEvent<HTMLDivElement>`.

Wire `onClick={handleTrackClick}` on the track `<div data-testid="composition-timeline" ...>`, and `onClick={(event) => handleClipClick(event, clip)}` on each clip `<div data-testid={\`composition-clip-${clip.id}\`} ...>`. Add `cursor: "pointer"` to `trackStyle` and `clipStyle`.

(Full updated render — track + clip elements get their `onClick`; everything else unchanged from Task 1.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionTimeline.test.tsx`
Expected: PASS (7 tests — 5 display + 2 interaction).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/composition/CompositionTimeline.tsx packages/editor/src/composition/CompositionTimeline.test.tsx
git commit -m "feat(editor): CompositionTimeline click-to-seek + click-to-select-clip"
```

---

## Task 3: Export from the package + full verification

**Files:**
- Modify: `packages/editor/src/index.ts`

- [ ] **Step 1: Add exports** — append to `packages/editor/src/index.ts`:

```ts
export type { CompositionTimelineProps } from "./composition/CompositionTimeline.js";
export { CompositionTimeline } from "./composition/CompositionTimeline.js";
```

- [ ] **Step 2: Run the editor test suite**

Run: `pnpm --filter @tinker/editor test`
Expected: PASS — all prior editor tests plus the 7 new CompositionTimeline tests.

- [ ] **Step 3: Typecheck the editor package**

Run: `pnpm --filter @tinker/editor typecheck`
Expected: PASS (zero errors).

- [ ] **Step 4: Confirm consumers still build**

Run: `pnpm --filter @tinker/web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/index.ts
git commit -m "feat(editor): export CompositionTimeline"
```

---

## Self-Review (done while writing)

- **Spec coverage:** Implements Component §3's display (clips, labels, playhead) and click-to-seek + click-to-select-clip, with the flat-composition (range-only) fallback. Drag-to-select-range is deliberately deferred to Phase 2 (its consumer) — noted in the roadmap so it isn't assumed done.
- **Placeholder scan:** none — every step has runnable code/commands. (Task 2 Step 3 shows the exact handler code and where to wire `onClick`; it modifies the Task 1 file rather than repeating the whole component, since they are the same file edited in sequence.)
- **Type consistency:** `CompositionTimelineProps`, `CompositionTimeline`, `onSeek`, `onSelectClip`, `selectedClipId` are defined in Task 1 and used unchanged in Tasks 2–3. Percent rendering and click→time both go through `createTimeScale`. `CompositionClip`/`CompositionTimelineModel` come from Phase 1a unchanged.

## Phase 1 roadmap (remaining)

- **Phase 1d — Wire Create Demo → composition:** switch Create Demo to the `ai-url-planning` request via `HttpCompositionGenerationClient` (Phase 0) with long-job polling UX; on a completed job, mount `CompositionPreview` (composition-index + output-video artifact URLs) and `CompositionTimeline` together, the timeline owning `currentTime` and feeding it to the preview, with the model coming from the preview's `onReady`. This is where real cross-window iframe access runs against generated compositions (and the recommended real-browser smoke lands).
- **Phase 2 (later) — drag-to-select-range** on `CompositionTimeline` plus the "add range/clip to chat" context system, consumed by the conversational edit loop.
