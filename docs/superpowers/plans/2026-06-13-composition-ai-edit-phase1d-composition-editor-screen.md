# Composition AI Editing — Phase 1d: Composition Editor Surface (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `CompositionEditorScreen` that, given a completed job's artifact URLs, mounts `CompositionPreview` + `CompositionTimeline` together with shared `currentTime` — the editable composition surface — without needing a `compositionId` (it reads the sole registered timeline).

**Architecture:** Extend the Phase 1b window layer to resolve the **single** registered timeline (`getSoleCompositionTimeline`), and make `compositionId` optional everywhere it flows (since the job doesn't expose it). The new `apps/web` screen owns `currentTime` + the timeline model: it passes `currentTime` into `CompositionPreview` (which seeks) and renders `CompositionTimeline` from the preview's `onReady` model; the timeline's `onSeek` updates `currentTime`. Tested in jsdom through the `resolveWindow` seam (no real composition needed).

**Tech Stack:** TypeScript (ESM, `.js` specifiers), React 19, Vitest (jsdom) + `@testing-library/react`.

**Branch:** `person-b/composition-ai-edit` (continue; Phases 0/1a/1b/1c on it).

**Spec:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md` (Components §2/§3 composed; data flow).

---

## Context this plan relies on (verified)

- `@tinker/editor` already exports: `CompositionPreview`/`CompositionPreviewProps` (Phase 1b), `CompositionTimeline`/`CompositionTimelineProps` (Phase 1c), `readCompositionTimeline`/`CompositionTimelineModel`/`CompositionClip` (Phase 1a), and the window layer `getCompositionTimeline`/`waitForCompositionTimeline`/`CompositionTimelineHandle`/`TimelineRegistryWindow` (Phase 1b).
- **The job does not expose `compositionId`** (it's only inside `index.html` as `data-composition-id` / the `window.__timelines` key). A generated composition registers exactly one master timeline, so the app reads the sole registry entry.
- `CompositionPreview` props (Phase 1b): `{ src, compositionId, currentTime?, onReady?(model, handle), onError?, fallbackVideoSrc?, timeoutMs?, resolveWindow? }`. `compositionId` is currently required — this plan makes it optional.
- `CompositionTimeline` props (Phase 1c): `{ model, currentTime, selectedClipId?, onSeek?(time), onSelectClip?(clip) }`. Clicking a clip calls `onSelectClip(clip)` AND `onSeek(clip.start)`.
- `apps/web` tests run in jsdom with `@testing-library/react` (see `App.test.tsx`). Run: `pnpm --filter @tinker/web test -- <path>` (web), `pnpm --filter @tinker/editor test -- <path>` (editor). Imports use `.js` specifiers.
- **Scope:** this plan delivers the composed surface; it does NOT rewire `App.tsx`/`CreateDemoScreen` (still DemoProject-centric) — that, with its app-shell decisions and the real-browser smoke, is Phase 1e (roadmapped below).

---

## File Structure

- Modify: `packages/editor/src/composition/compositionWindow.ts` — add `getSoleCompositionTimeline`; make `compositionId` optional in `getCompositionTimeline`/`waitForCompositionTimeline`.
- Modify: `packages/editor/src/composition/compositionWindow.test.ts` — sole-timeline + optional-id tests.
- Modify: `packages/editor/src/composition/CompositionPreview.tsx` — `compositionId?` optional (sole-timeline fallback).
- Modify: `packages/editor/src/composition/CompositionPreview.test.tsx` — no-id test.
- Create: `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx` — the composed surface.
- Create: `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`.

---

## Task 1: Window layer — resolve the sole timeline / optional compositionId

**Files:**
- Modify: `packages/editor/src/composition/compositionWindow.ts`
- Test: `packages/editor/src/composition/compositionWindow.test.ts`

- [ ] **Step 1: Write the failing test** — append to `compositionWindow.test.ts` (inside the file, after the existing tests; reuse the existing `fakeHandle` helper already defined at the top):

```ts
describe("getSoleCompositionTimeline", () => {
  it("returns the only registered handle", () => {
    const handle = fakeHandle();
    expect(getSoleCompositionTimeline({ __timelines: { only: handle } })).toBe(handle);
  });

  it("returns undefined when there are zero or multiple handles", () => {
    expect(getSoleCompositionTimeline({ __timelines: {} })).toBeUndefined();
    expect(getSoleCompositionTimeline({ __timelines: { a: fakeHandle(), b: fakeHandle() } })).toBeUndefined();
    expect(getSoleCompositionTimeline(undefined)).toBeUndefined();
  });

  it("ignores non-handle registry values when picking the sole handle", () => {
    const handle = fakeHandle();
    const win = { __timelines: { good: handle, junk: { totalDuration: () => 1 } } } as unknown as TimelineRegistryWindow;
    expect(getSoleCompositionTimeline(win)).toBe(handle);
  });
});

describe("getCompositionTimeline with no compositionId", () => {
  it("falls back to the sole registered handle", () => {
    const handle = fakeHandle();
    expect(getCompositionTimeline({ __timelines: { only: handle } })).toBe(handle);
  });
});

describe("waitForCompositionTimeline with no compositionId", () => {
  it("resolves the sole handle once it registers", async () => {
    const handle = fakeHandle();
    let calls = 0;
    const getWindow = (): TimelineRegistryWindow => (++calls >= 2 ? { __timelines: { only: handle } } : { __timelines: {} });
    const result = await waitForCompositionTimeline(getWindow, undefined, { intervalMs: 0, sleep: async () => undefined, now: () => 0 });
    expect(result).toBe(handle);
  });
});
```

Add `getSoleCompositionTimeline` to the existing import at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor test -- src/composition/compositionWindow.test.ts`
Expected: FAIL — `getSoleCompositionTimeline` is not exported; `getCompositionTimeline`/`waitForCompositionTimeline` reject an undefined id.

- [ ] **Step 3: Edit the implementation** — in `packages/editor/src/composition/compositionWindow.ts`:

Add this exported function (after `getCompositionTimeline`):

```ts
/** Read the sole registered timeline — for a generated composition that registers exactly one master. */
export function getSoleCompositionTimeline(
  win: TimelineRegistryWindow | null | undefined,
): CompositionTimelineHandle | undefined {
  const registry = win?.__timelines;
  if (!registry) return undefined;
  const handles = Object.values(registry).filter(isCompositionTimelineHandle);
  return handles.length === 1 ? handles[0] : undefined;
}
```

Change `getCompositionTimeline` so `compositionId` is optional and falls back to the sole handle:

```ts
export function getCompositionTimeline(
  win: TimelineRegistryWindow | null | undefined,
  compositionId?: string,
): CompositionTimelineHandle | undefined {
  if (compositionId === undefined) {
    return getSoleCompositionTimeline(win);
  }
  const candidate = win?.__timelines?.[compositionId];
  return isCompositionTimelineHandle(candidate) ? candidate : undefined;
}
```

Change `waitForCompositionTimeline`'s signature so `compositionId` is optional, and make the timeout message handle the no-id case:

```ts
export async function waitForCompositionTimeline(
  getWindow: () => TimelineRegistryWindow | null | undefined,
  compositionId: string | undefined,
  options: WaitForCompositionTimelineOptions = {},
): Promise<CompositionTimelineHandle> {
```

and replace the timeout `throw` line with:

```ts
    if (now() - start >= timeoutMs) {
      const target = compositionId === undefined ? "the sole window.__timelines entry" : `window.__timelines["${compositionId}"]`;
      throw new Error(`Timed out waiting for ${target} after ${timeoutMs}ms`);
    }
```

(`isCompositionTimelineHandle` is already defined and used; `Object.values(...).filter(isCompositionTimelineHandle)` narrows to `CompositionTimelineHandle[]`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor test -- src/composition/compositionWindow.test.ts`
Expected: PASS (existing 7 + 5 new). Also run the existing timeout test still passes (the id-based message path is unchanged for string ids).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/composition/compositionWindow.ts packages/editor/src/composition/compositionWindow.test.ts
git commit -m "feat(editor): resolve the sole composition timeline (optional compositionId)"
```

---

## Task 2: CompositionPreview — make compositionId optional

**Files:**
- Modify: `packages/editor/src/composition/CompositionPreview.tsx`
- Test: `packages/editor/src/composition/CompositionPreview.test.tsx`

- [ ] **Step 1: Write the failing test** — append to `CompositionPreview.test.tsx` (inside the existing `describe`, reuse `fakeHandle`/`SRC`):

```tsx
  it("reads the sole timeline when no compositionId is given", async () => {
    const handle = fakeHandle();
    const onReady = vi.fn();
    render(
      <CompositionPreview
        src={SRC}
        onReady={onReady}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { whatever: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(onReady.mock.calls[0]![0].durationSeconds).toBe(8);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionPreview.test.tsx`
Expected: FAIL — `compositionId` is a required prop (TS error / missing-prop).

- [ ] **Step 3: Edit the implementation** — in `CompositionPreview.tsx`:

Make the prop optional:

```tsx
  /** The composition id (matches data-composition-id / window.__timelines key). Omit to use the sole registered timeline. */
  compositionId?: string;
```

The `handleLoad` call already passes `compositionId` to `waitForCompositionTimeline`; with Task 1's change, passing `undefined` resolves the sole timeline — no further change needed there.

Update the iframe `key` to tolerate an undefined id:

```tsx
          key={`${src}::${compositionId ?? "sole"}`}
```

And the identity-reset effect dependency list already includes `compositionId`; leaving it `undefined` is fine (stable across renders).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionPreview.test.tsx`
Expected: PASS (existing 5 + 1 new).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/composition/CompositionPreview.tsx packages/editor/src/composition/CompositionPreview.test.tsx
git commit -m "feat(editor): CompositionPreview compositionId optional (sole-timeline fallback)"
```

---

## Task 3: CompositionEditorScreen — compose preview + timeline

**Files:**
- Create: `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx`
- Test: `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`

- [ ] **Step 1: Write the failing test** — create `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CompositionTimelineHandle, TimelineRegistryWindow } from "@tinker/editor";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

function fakeHandle(seek: (t: number) => void): CompositionTimelineHandle {
  return {
    totalDuration: () => 10,
    labels: [] as unknown as Record<string, number>,
    getChildren: () => [
      { startTime: () => 0, totalDuration: () => 4, vars: { id: "hook" } },
      { startTime: () => 4, totalDuration: () => 6, vars: { id: "feature" } },
    ],
    seek,
    play: () => undefined,
    pause: () => undefined,
  } as unknown as CompositionTimelineHandle;
}

const INDEX = "/api/jobs/j/artifacts/hyperframes/index.html";
const VIDEO = "/api/jobs/j/artifacts/hyperframes/output.mp4";

describe("CompositionEditorScreen", () => {
  it("shows the timeline (from the preview model) once the composition loads", async () => {
    const seeks: number[] = [];
    const handle = fakeHandle((t) => seeks.push(t));
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    expect(screen.getByTestId("composition-clip-hook")).toBeInTheDocument();
    expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument();
  });

  it("seeks the preview when a clip is clicked in the timeline", async () => {
    const seeks: number[] = [];
    const handle = fakeHandle((t) => seeks.push(t));
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    await waitFor(() => expect(seeks).toContain(4)); // feature.start, applied to the preview handle
    expect(screen.getByTestId("composition-clip-feature")).toHaveAttribute("data-selected", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/web test -- src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`
Expected: FAIL — cannot find module `./CompositionEditorScreen.js`.

- [ ] **Step 3: Write minimal implementation** — create `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx`:

```tsx
import { useState, type CSSProperties } from "react";
import {
  CompositionPreview,
  CompositionTimeline,
  type CompositionClip,
  type CompositionTimelineModel,
  type TimelineRegistryWindow,
} from "@tinker/editor";

export type CompositionEditorScreenProps = {
  /** URL of the composition-index artifact (index.html). */
  compositionIndexUrl: string;
  /** URL of the output-video artifact (mp4), used as the preview fallback. */
  outputVideoUrl?: string;
  /** Test seam: forwarded to CompositionPreview to resolve the iframe content window. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 };
const previewStyle: CSSProperties = { flex: 1, minHeight: 0 };
const timelineStyle: CSSProperties = { flexShrink: 0 };

export function CompositionEditorScreen({ compositionIndexUrl, outputVideoUrl, resolveWindow }: CompositionEditorScreenProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [model, setModel] = useState<CompositionTimelineModel | undefined>(undefined);
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>(undefined);

  function handleSelectClip(clip: CompositionClip) {
    setSelectedClipId(clip.id);
  }

  return (
    <div style={pageStyle}>
      <div style={previewStyle}>
        <CompositionPreview
          src={compositionIndexUrl}
          currentTime={currentTime}
          fallbackVideoSrc={outputVideoUrl}
          onReady={(readyModel) => setModel(readyModel)}
          resolveWindow={resolveWindow}
        />
      </div>
      {model ? (
        <div style={timelineStyle}>
          <CompositionTimeline
            model={model}
            currentTime={currentTime}
            selectedClipId={selectedClipId}
            onSeek={setCurrentTime}
            onSelectClip={handleSelectClip}
          />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/web test -- src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`
Expected: PASS (2 tests). The clip click calls the timeline's `onSeek(4)` → `setCurrentTime(4)` → re-render → `CompositionPreview` seeks the handle to 4 (recorded in `seeks`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx
git commit -m "feat(web): CompositionEditorScreen composing preview + timeline (shared currentTime)"
```

---

## Task 4: Full verification

- [ ] **Step 1: Editor package tests**

Run: `pnpm --filter @tinker/editor test`
Expected: PASS (all editor tests incl. the Task 1/2 additions).

- [ ] **Step 2: Web package tests**

Run: `pnpm --filter @tinker/web test`
Expected: PASS (all web tests incl. the new CompositionEditorScreen tests).

- [ ] **Step 3: Typecheck both**

Run: `pnpm --filter @tinker/editor typecheck` then `pnpm --filter @tinker/web typecheck`
Expected: PASS (zero errors).

- [ ] **Step 4: Build the web app**

Run: `pnpm --filter @tinker/web build`
Expected: PASS.

- [ ] **Step 5: Commit (no-op safety / nothing to commit is fine)**

If any incidental fix was needed during verification, commit it; otherwise this step is a checkpoint only.

---

## Self-Review (done while writing)

- **Spec coverage:** Implements the composed data flow of Components §2/§3 — the screen owns `currentTime` + the model, `CompositionPreview` seeks on `currentTime` and emits the model via `onReady`, `CompositionTimeline` renders that model and drives `onSeek`/`onSelectClip`. The missing-`compositionId` reality is handled by the sole-timeline resolution (Task 1) so the preview works against a real job.
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `getSoleCompositionTimeline`, the optional `compositionId` on `getCompositionTimeline`/`waitForCompositionTimeline`/`CompositionPreview`, and `CompositionEditorScreenProps` are defined in Tasks 1–3 and used consistently. The screen imports `CompositionPreview`/`CompositionTimeline`/types from `@tinker/editor` (exported in 1a–1c). The `resolveWindow` test seam has the same signature across `CompositionPreview` and the screen.
- **Test-seam honesty:** the screen tests inject `resolveWindow` (a fake window), so they verify the composed wiring (load → model → timeline → click → seek), not real cross-window iframe access. That real access is exercised in Phase 1e against a generated composition (and the recommended real-browser smoke).

## Phase 1 roadmap (remaining)

- **Phase 1e — App + Create Demo wiring (real generation):** the decisions deferred here. Switch Create Demo to the `ai-url-planning` request via `HttpCompositionGenerationClient` (Phase 0; `MockCompositionGenerationClient` as the dev/test default) with long-job polling UX; on a completed job, route to `CompositionEditorScreen` using the `composition-index` + `output-video` artifact URLs (via `selectArtifactUrl`). Decide: replace vs keep the DemoProject `EditorScreen`/sample path, and the routing shape in `App.tsx`. This is where real cross-window iframe access runs end-to-end and the real-browser smoke lands.
- **Phase 2 (later) — drag-to-select-range** on `CompositionTimeline` + the "add range/clip to chat" context system feeding the conversational edit loop.
