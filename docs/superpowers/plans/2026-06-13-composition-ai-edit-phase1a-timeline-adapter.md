# Composition AI Editing — Phase 1a: Timeline Adapter (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, tested function `readCompositionTimeline` that turns a generated composition's GSAP master timeline into a structured `{ durationSeconds, clips, labels }` model — the data both the composition preview and the timeline UI will consume.

**Architecture:** The function reads a minimal `GsapTimelineLike` interface (what we need from a GSAP master timeline: `totalDuration()`, `labels`, `getChildren()`), so the logic is decoupled from the `gsap` package and unit-testable with fakes. A second test verifies the same function against a **real `gsap.timeline()`** (timeline structure runs in jsdom — no browser), which empirically confirms the GSAP-introspection assumptions the whole feature rests on. Lives in `packages/editor/src/composition/` (where the spec places `CompositionTimeline`); no new package.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest (jsdom env, globals), `gsap@^3.15.0` (dev-only, for the verification test).

**Branch:** `person-b/composition-ai-edit` (continue on it; Phase 0 already merged into this branch's history).

**Spec:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md` (Components §2 adapter + §3 timeline; "Selection Granularity").

---

## Context this plan relies on (verified)

- Generated compositions register their GSAP master timeline at `window.__timelines[compositionId]` (Person A lint-enforced). Reading it is Phase 1b; this plan only needs the *shape* of that timeline object.
- GSAP introspection API (from GSAP docs): `getChildren(nested, tweens, timelines, ignoreBeforeTime)` returns children; `getChildren(false, false, true)` → top-level **child timelines only** (our "clips"). Each child has `startTime()` and `totalDuration()`. A timeline created with `gsap.timeline({ id: "x" })` stores the id at `.vars.id`. `timeline.labels` is a `Record<name, time>`. `timeline.totalDuration()` is the full length.
- `packages/editor` runs Vitest with `environment: "jsdom"`, `globals: true`, React plugin. Single-file run: `pnpm --filter @tinker/editor test -- <path-relative-to-packages/editor>`. Imports use `.js` specifiers. `packages/editor/tsconfig.json` `include`s all of `src/**/*.ts(x)` (test files are compiled), so a dev-only import like `gsap` must be installed for typecheck/build.
- Clips are optional: a "flat" composition (no nested scene timelines) yields zero clips → the UI falls back to range-only selection. The adapter must handle this.

---

## File Structure

- Create: `packages/editor/src/composition/compositionTimelineModel.ts` — `GsapTimelineLike`/`GsapChildLike` input interfaces, the `CompositionTimelineModel`/`CompositionClip`/`CompositionTimelineLabel` output types, and `readCompositionTimeline`.
- Create: `packages/editor/src/composition/compositionTimelineModel.test.ts` — fake-timeline unit tests (edge cases).
- Create: `packages/editor/src/composition/compositionTimelineModel.gsap.test.ts` — real-`gsap` verification test.
- Modify: `packages/editor/package.json` — add `gsap` to `devDependencies`.
- Modify: `packages/editor/src/index.ts` — export the new types + function.

---

## Task 1: The `readCompositionTimeline` adapter (fake-timeline TDD)

**Files:**
- Create: `packages/editor/src/composition/compositionTimelineModel.ts`
- Test: `packages/editor/src/composition/compositionTimelineModel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/editor/src/composition/compositionTimelineModel.test.ts
import { describe, expect, it } from "vitest";
import { readCompositionTimeline, type GsapTimelineLike } from "./compositionTimelineModel.js";

function fakeTimeline(opts: {
  totalDuration: number;
  labels?: Record<string, number>;
  children?: { id?: string; start: number; duration: number }[];
}): GsapTimelineLike {
  return {
    totalDuration: () => opts.totalDuration,
    labels: opts.labels ?? {},
    getChildren: () =>
      (opts.children ?? []).map((child) => ({
        startTime: () => child.start,
        totalDuration: () => child.duration,
        vars: child.id === undefined ? {} : { id: child.id },
      })),
  };
}

describe("readCompositionTimeline", () => {
  it("reads duration, named clips, and time-sorted labels", () => {
    const model = readCompositionTimeline(
      fakeTimeline({
        totalDuration: 9,
        labels: { cta: 7.8, hook: 0 },
        children: [
          { id: "hook", start: 0, duration: 4.2 },
          { id: "feature", start: 4.2, duration: 3.6 },
        ],
      }),
    );
    expect(model.durationSeconds).toBe(9);
    expect(model.clips).toEqual([
      { id: "hook", label: "hook", start: 0, end: 4.2 },
      { id: "feature", label: "feature", start: 4.2, end: 7.8 },
    ]);
    expect(model.labels).toEqual([
      { name: "hook", time: 0 },
      { name: "cta", time: 7.8 },
    ]);
  });

  it("generates ids and omits labels for unnamed child timelines", () => {
    const model = readCompositionTimeline(
      fakeTimeline({ totalDuration: 5, children: [{ start: 0, duration: 5 }] }),
    );
    expect(model.clips).toEqual([{ id: "clip-0", label: undefined, start: 0, end: 5 }]);
  });

  it("returns no clips for a flat composition (range-only fallback)", () => {
    const model = readCompositionTimeline(fakeTimeline({ totalDuration: 6 }));
    expect(model.clips).toEqual([]);
    expect(model.labels).toEqual([]);
    expect(model.durationSeconds).toBe(6);
  });

  it("clamps a negative or NaN duration to zero", () => {
    expect(readCompositionTimeline(fakeTimeline({ totalDuration: -1 })).durationSeconds).toBe(0);
    expect(readCompositionTimeline(fakeTimeline({ totalDuration: Number.NaN })).durationSeconds).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor test -- src/composition/compositionTimelineModel.test.ts`
Expected: FAIL — cannot find module `./compositionTimelineModel.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/editor/src/composition/compositionTimelineModel.ts

/**
 * Minimal shape we read from a GSAP master timeline, decoupled from the `gsap`
 * package. A real `gsap.core.Timeline` satisfies this structurally.
 */
export interface GsapTimelineLike {
  totalDuration(): number;
  labels: Record<string, number>;
  getChildren(
    nested?: boolean,
    tweens?: boolean,
    timelines?: boolean,
    ignoreBeforeTime?: number,
  ): GsapChildLike[];
}

/** A top-level child of the master timeline (a nested scene timeline = a "clip"). */
export interface GsapChildLike {
  startTime(): number;
  totalDuration(): number;
  vars?: { id?: unknown };
}

export type CompositionClip = {
  id: string;
  label?: string;
  start: number;
  end: number;
};

export type CompositionTimelineLabel = {
  name: string;
  time: number;
};

export type CompositionTimelineModel = {
  durationSeconds: number;
  clips: CompositionClip[];
  labels: CompositionTimelineLabel[];
};

function clampDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function readClipIdentity(child: GsapChildLike, index: number): { id: string; label?: string } {
  const rawId = child.vars?.id;
  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return { id: rawId, label: rawId };
  }
  return { id: `clip-${index}` };
}

/**
 * Read a generated composition's GSAP master timeline into a structured model.
 * Clips are the top-level nested scene timelines (`getChildren(false, false, true)`);
 * a flat composition yields zero clips (the UI then offers range-only selection).
 */
export function readCompositionTimeline(timeline: GsapTimelineLike): CompositionTimelineModel {
  const durationSeconds = clampDuration(timeline.totalDuration());

  const clips: CompositionClip[] = timeline
    .getChildren(false, false, true)
    .map((child, index) => {
      const { id, label } = readClipIdentity(child, index);
      const start = child.startTime();
      return { id, label, start, end: start + clampDuration(child.totalDuration()) };
    });

  const labels: CompositionTimelineLabel[] = Object.entries(timeline.labels)
    .map(([name, time]) => ({ name, time }))
    .sort((a, b) => a.time - b.time);

  return { durationSeconds, clips, labels };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor test -- src/composition/compositionTimelineModel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/composition/compositionTimelineModel.ts packages/editor/src/composition/compositionTimelineModel.test.ts
git commit -m "feat(editor): readCompositionTimeline adapter (GSAP timeline -> structured model)"
```

---

## Task 2: Verify against a real GSAP timeline

**Files:**
- Modify: `packages/editor/package.json` (add `gsap` to `devDependencies`)
- Create: `packages/editor/src/composition/compositionTimelineModel.gsap.test.ts`

- [ ] **Step 1: Add `gsap` as a dev dependency**

In `packages/editor/package.json`, add to `devDependencies` (alphabetical order, keep JSON valid):

```json
    "gsap": "^3.15.0",
```

- [ ] **Step 2: Install**

Run (from repo root): `pnpm install`
Expected: completes; `gsap` resolved for `@tinker/editor`.

- [ ] **Step 3: Write the failing verification test**

```ts
// packages/editor/src/composition/compositionTimelineModel.gsap.test.ts
import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { readCompositionTimeline } from "./compositionTimelineModel.js";

// Confirms the GSAP-introspection assumptions readCompositionTimeline relies on,
// against the real library. Timeline structure runs in jsdom (no rendering needed):
// we tween plain-object properties purely to give the child timelines a duration.
describe("readCompositionTimeline with a real GSAP timeline", () => {
  it("reads nested labeled scene timelines from a real gsap.timeline()", () => {
    const master = gsap.timeline({ paused: true });

    const hook = gsap.timeline({ id: "hook", paused: true });
    hook.to({ v: 0 }, { v: 1, duration: 2 });

    const feature = gsap.timeline({ id: "feature", paused: true });
    feature.to({ v: 0 }, { v: 1, duration: 3 });

    master.add(hook, 0);
    master.add(feature, 2);
    master.addLabel("cta", 5);

    const model = readCompositionTimeline(master);

    expect(model.durationSeconds).toBeCloseTo(5, 5);
    expect(model.clips.map((clip) => clip.id)).toEqual(["hook", "feature"]);
    expect(model.clips[0]).toMatchObject({ id: "hook", label: "hook" });
    expect(model.clips[0]!.start).toBeCloseTo(0, 5);
    expect(model.clips[0]!.end).toBeCloseTo(2, 5);
    expect(model.clips[1]!.start).toBeCloseTo(2, 5);
    expect(model.clips[1]!.end).toBeCloseTo(5, 5);
    expect(model.labels).toEqual([{ name: "cta", time: 5 }]);
  });
});
```

- [ ] **Step 4: Run the verification test**

Run: `pnpm --filter @tinker/editor test -- src/composition/compositionTimelineModel.gsap.test.ts`
Expected: PASS (1 test). 

If it FAILS, the failure tells you which GSAP assumption is wrong (e.g. id not on `vars.id`, or `getChildren(false,false,true)` shape) — adjust `compositionTimelineModel.ts` (and Task 1's tests if the input interface changes) to match real GSAP, re-run Task 1's tests, then re-run this. Do NOT weaken this test to pass; it exists to keep the adapter honest to real GSAP. If `gsap` cannot run in the jsdom test env at all, STOP and report — the fallback is a Playwright-based verification in Phase 1b.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/package.json packages/editor/src/composition/compositionTimelineModel.gsap.test.ts pnpm-lock.yaml
git commit -m "test(editor): verify readCompositionTimeline against a real gsap timeline"
```

---

## Task 3: Export from the package + full verification

**Files:**
- Modify: `packages/editor/src/index.ts`

- [ ] **Step 1: Add exports**

Append to `packages/editor/src/index.ts`:

```ts
export type {
  CompositionClip,
  CompositionTimelineLabel,
  CompositionTimelineModel,
  GsapChildLike,
  GsapTimelineLike,
} from "./composition/compositionTimelineModel.js";
export { readCompositionTimeline } from "./composition/compositionTimelineModel.js";
```

- [ ] **Step 2: Run the editor test suite**

Run: `pnpm --filter @tinker/editor test`
Expected: PASS — all prior editor tests plus the 5 new tests (Tasks 1–2).

- [ ] **Step 3: Typecheck the editor package**

Run: `pnpm --filter @tinker/editor typecheck`
Expected: PASS (zero errors; confirms the `gsap` dev import typechecks under the test-inclusive tsconfig).

- [ ] **Step 4: Confirm consumers still build**

Run: `pnpm --filter @tinker/web build`
Expected: PASS (the web app, which imports `@tinker/editor`, still builds).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/index.ts
git commit -m "feat(editor): export readCompositionTimeline + composition timeline types"
```

---

## Self-Review (done while writing)

- **Spec coverage:** Covers the data half of Components §2/§3 and "Selection Granularity" — producing `durationSeconds` (scrubber), `clips` (clickable scenes when present), `labels`, and the flat-composition→no-clips fallback. The iframe/`window.__timelines` access (Component §2 glue), the visual `CompositionTimeline` (§3 UI), and Create Demo wiring are intentionally **separate follow-on plans** (see roadmap) — noted so they aren't assumed done.
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `GsapTimelineLike`, `GsapChildLike`, `CompositionClip`, `CompositionTimelineLabel`, `CompositionTimelineModel`, `readCompositionTimeline` are defined in Task 1 and used unchanged in Tasks 2–3. The fake in Task 1 and the real gsap timeline in Task 2 both target the same `GsapTimelineLike` shape.
- **Risk note:** Task 2 depends on `gsap` running in jsdom and the introspection API matching the docs. It is written as a test precisely so a wrong assumption fails fast and visibly; the fallback (Playwright verification) is documented in Task 2 Step 4.

## Phase 1 roadmap (subsequent plans)

- **Phase 1b — Composition preview + iframe glue:** a `CompositionPreview` React component that loads the `composition-index` artifact in a sandboxed iframe, reaches `iframe.contentWindow.__timelines[compositionId]`, adapts it via `readCompositionTimeline`, and exposes `seek/play/pause`. Verified with a real-browser (Playwright) spike + a fixture `index.html`. Graceful `<video>` fallback when the timeline handle is absent.
- **Phase 1c — CompositionTimeline UI:** scrubber + playhead synced to the preview; ticks/labels/clips from the model; drag-to-select a range; click-to-select a clip (range-only when `clips` is empty).
- **Phase 1d — Wire Create Demo → composition:** switch the request to the `ai-url-planning` shape, drive it with `HttpCompositionGenerationClient` + long-job polling UX, and land a completed job on the composition preview.
