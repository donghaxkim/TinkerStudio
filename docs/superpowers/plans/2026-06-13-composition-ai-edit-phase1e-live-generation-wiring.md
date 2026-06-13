# Composition AI Editing — Phase 1e: Live Generation Wiring (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the composition pipeline reachable end-to-end in the running app — submit a request → generate a job (polling UX) → open the completed composition in `CompositionEditorScreen` — **without** disturbing the existing DemoProject flow.

**Architecture:** A `useCompositionGenerationJob` hook wraps a `CompositionGenerationClient` (Phase 0): submit → poll to terminal → expose phase/job/error. A new `CompositionDemoScreen` collects a minimal `ai-url-planning` request, drives the hook (progress + cancel + error), and on completion renders `CompositionEditorScreen` with the artifact URLs (`selectArtifactUrl`). `App.tsx` mounts it on an additive `"composition"` route with the **mock** client by default (the real `HttpCompositionGenerationClient` is a drop-in swap). The existing DemoProject `create`/`editor`/`settings` routes are untouched.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), React 19, Vitest (jsdom) + `@testing-library/react` (incl. `renderHook`).

**Branch:** `person-b/composition-ai-edit` (continue; Phases 0–1d on it).

**Spec:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md` (data flow; long-job UX).

---

## Context this plan relies on (verified)

- Phase 0 (`apps/web/src/lib`): `CompositionGenerationClient` interface (`createJob(request)`, `getJob(id)`, `waitForJob(id, { onUpdate?, signal?, intervalMs? })`), `CreateCompositionJobRequest` (`{ mode: "ai-url-planning"; repoUrl; productUrl; durationCapSeconds; aspectRatio; prompt?; renderer? }`), `selectArtifactUrl(job, kind)`, `createMockCompositionGenerationClient()` (deterministic — `createJob` returns a `running` snapshot, `waitForJob` resolves a `completed` job with `composition-index` + `output-video` artifacts), `createHttpCompositionGenerationClient()`.
- Phase 1d (`@tinker/editor` → `apps/web`): `CompositionEditorScreen` (`{ compositionIndexUrl, outputVideoUrl?, resolveWindow? }`). It reads the sole timeline, so no `compositionId` is needed.
- `ApiGenerationJob.status` terminal values are `"completed"` / `"failed"`; `result.artifacts` exists only when completed; `error` only when failed.
- `apps/web` tests: jsdom + `@testing-library/react`; `App.test.tsx` drives the existing create→editor flow and must keep passing (this plan is additive). Run: `pnpm --filter @tinker/web test -- <path>`. Imports use `.js`.
- **Scope:** non-destructive. No change to `CreateDemoScreen.tsx`, `EditorScreen.tsx`, or the DemoProject `GenerationClient`. The full retirement of the DemoProject flow is a deliberate later cleanup (roadmapped).

---

## File Structure

- Create: `apps/web/src/lib/useCompositionGenerationJob.ts` — the generation-job state machine hook.
- Create: `apps/web/src/lib/useCompositionGenerationJob.test.ts` — hook tests (mock client).
- Create: `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx` — request form → hook → `CompositionEditorScreen`.
- Create: `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.test.tsx`.
- Modify: `apps/web/src/App.tsx` — additive `"composition"` route + entry button + mock client.
- Modify: `apps/web/src/App.test.tsx` — one test for the new route (existing tests unchanged).

---

## Task 1: `useCompositionGenerationJob` hook

**Files:**
- Create: `apps/web/src/lib/useCompositionGenerationJob.ts`
- Test: `apps/web/src/lib/useCompositionGenerationJob.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/useCompositionGenerationJob.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectArtifactUrl } from "./compositionGenerationClient.js";
import { createMockCompositionGenerationClient } from "./mockCompositionGenerationClient.js";
import { useCompositionGenerationJob } from "./useCompositionGenerationJob.js";

const REQUEST = {
  mode: "ai-url-planning" as const,
  repoUrl: "https://github.com/acme/driftboard",
  productUrl: "https://driftboard.example.com",
  durationCapSeconds: 60,
  aspectRatio: "16:9" as const,
};

describe("useCompositionGenerationJob", () => {
  it("starts idle, runs, then completes with the job artifacts", async () => {
    const client = createMockCompositionGenerationClient();
    const { result } = renderHook(() => useCompositionGenerationJob(client));
    expect(result.current.phase).toBe("idle");

    await act(async () => {
      await result.current.start(REQUEST);
    });

    expect(result.current.phase).toBe("completed");
    expect(selectArtifactUrl(result.current.job!, "composition-index")).toContain("index.html");
  });

  it("reports a failure phase + message when the client rejects", async () => {
    const failing = {
      createJob: async () => {
        throw new Error("queue full");
      },
      getJob: async () => {
        throw new Error("unused");
      },
      waitForJob: async () => {
        throw new Error("unused");
      },
    };
    const { result } = renderHook(() => useCompositionGenerationJob(failing));
    await act(async () => {
      await result.current.start(REQUEST);
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.error).toBe("queue full");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/web test -- src/lib/useCompositionGenerationJob.test.ts`
Expected: FAIL — cannot find module `./useCompositionGenerationJob.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/useCompositionGenerationJob.ts
import { useCallback, useRef, useState } from "react";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import type { CompositionGenerationClient, CreateCompositionJobRequest } from "./compositionGenerationClient.js";

export type CompositionJobPhase = "idle" | "running" | "completed" | "failed";

export type CompositionJobState = {
  phase: CompositionJobPhase;
  job?: ApiGenerationJob;
  error?: string;
};

export type UseCompositionGenerationJob = CompositionJobState & {
  start: (request: CreateCompositionJobRequest) => Promise<void>;
  cancel: () => void;
};

export function useCompositionGenerationJob(client: CompositionGenerationClient): UseCompositionGenerationJob {
  const [state, setState] = useState<CompositionJobState>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (request: CreateCompositionJobRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ phase: "running" });
      try {
        const created = await client.createJob(request);
        const job = await client.waitForJob(created.id, {
          signal: controller.signal,
          onUpdate: (updated) => {
            if (!controller.signal.aborted) setState({ phase: "running", job: updated });
          },
        });
        if (controller.signal.aborted) return;
        if (job.status === "completed") {
          setState({ phase: "completed", job });
        } else {
          setState({ phase: "failed", job, error: job.error?.message ?? "Generation failed." });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [client],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState({ phase: "idle" });
  }, []);

  return { ...state, start, cancel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/web test -- src/lib/useCompositionGenerationJob.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/useCompositionGenerationJob.ts apps/web/src/lib/useCompositionGenerationJob.test.ts
git commit -m "feat(web): useCompositionGenerationJob hook (submit + poll + terminal state)"
```

---

## Task 2: `CompositionDemoScreen` — request → generate → editor

**Files:**
- Create: `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx`
- Test: `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/screens/CompositionEditor/CompositionDemoScreen.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TimelineRegistryWindow, CompositionTimelineHandle } from "@tinker/editor";
import { createMockCompositionGenerationClient } from "../../lib/mockCompositionGenerationClient.js";
import { CompositionDemoScreen } from "./CompositionDemoScreen.js";

function fakeHandle(): CompositionTimelineHandle {
  return {
    totalDuration: () => 10,
    labels: [] as unknown as Record<string, number>,
    getChildren: () => [{ startTime: () => 0, totalDuration: () => 10, vars: { id: "scene" } }],
    seek: () => undefined,
    play: () => undefined,
    pause: () => undefined,
  } as unknown as CompositionTimelineHandle;
}

describe("CompositionDemoScreen", () => {
  it("generates a composition and opens it in the editor", async () => {
    const client = createMockCompositionGenerationClient();
    render(
      <CompositionDemoScreen
        client={client}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    // Lands in the editor once the (mock) job completes.
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/web test -- src/screens/CompositionEditor/CompositionDemoScreen.test.tsx`
Expected: FAIL — cannot find module `./CompositionDemoScreen.js`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx
import { useState, type CSSProperties, type FormEvent } from "react";
import type { TimelineRegistryWindow } from "@tinker/editor";
import type { CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
import { selectArtifactUrl } from "../../lib/compositionGenerationClient.js";
import { useCompositionGenerationJob } from "../../lib/useCompositionGenerationJob.js";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  /** Test seam forwarded to CompositionEditorScreen. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0, padding: 24 };
const fieldStyle: CSSProperties = { display: "grid", gap: 4 };

export function CompositionDemoScreen({ client, resolveWindow }: CompositionDemoScreenProps) {
  const job = useCompositionGenerationJob(client);
  const [repoUrl, setRepoUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  if (job.phase === "completed" && job.job) {
    const compositionIndexUrl = selectArtifactUrl(job.job, "composition-index");
    if (compositionIndexUrl) {
      return (
        <CompositionEditorScreen
          compositionIndexUrl={compositionIndexUrl}
          outputVideoUrl={selectArtifactUrl(job.job, "output-video")}
          resolveWindow={resolveWindow}
        />
      );
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void job.start({
      mode: "ai-url-planning",
      repoUrl,
      productUrl,
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      ...(prompt.trim() === "" ? {} : { prompt }),
    });
  }

  return (
    <div className="tk-porcelain" style={pageStyle}>
      {job.phase === "running" ? (
        <div data-testid="composition-generating" aria-live="polite">
          Generating composition…{" "}
          <button type="button" className="tk-btn" onClick={job.cancel}>
            Cancel
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 460 }}>
          <label style={fieldStyle}>
            Repo URL
            <input className="tk-input" value={repoUrl} onChange={(e) => setRepoUrl(e.currentTarget.value)} />
          </label>
          <label style={fieldStyle}>
            Product URL
            <input className="tk-input" value={productUrl} onChange={(e) => setProductUrl(e.currentTarget.value)} />
          </label>
          <label style={fieldStyle}>
            Prompt
            <input className="tk-input" value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} />
          </label>
          <button type="submit" className="tk-btn tk-btn-accent">
            Generate
          </button>
        </form>
      )}
      {job.phase === "failed" ? (
        <div role="alert" style={{ color: "var(--tk-danger, #C0392B)" }}>
          {job.error}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/web test -- src/screens/CompositionEditor/CompositionDemoScreen.test.tsx`
Expected: PASS (1 test). (`tk-input`/`tk-btn` classes are pre-existing Porcelain styles; if a class doesn't exist, the input still renders and the test — which finds inputs by their label text and the button by role — passes regardless.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx apps/web/src/screens/CompositionEditor/CompositionDemoScreen.test.tsx
git commit -m "feat(web): CompositionDemoScreen — request -> generate -> composition editor"
```

---

## Task 3: Wire an additive `"composition"` route into App

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write the failing test** — APPEND to `App.test.tsx` (a new `describe`; do NOT change existing tests):

```tsx
describe("App composition route", () => {
  it("opens the composition demo from the create screen entry", async () => {
    const { render, screen, fireEvent } = await import("@testing-library/react");
    const { App } = await import("./App.js");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Composition demo (beta)" }));
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });
});
```

(If `App.test.tsx` already imports `render`/`screen`/`fireEvent` at the top, use those instead of the inline dynamic import — match the file's existing import style; the assertion is what matters: clicking the beta entry shows the composition demo's "Generate" button.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/web test -- src/App.test.tsx`
Expected: FAIL — no "Composition demo (beta)" button.

- [ ] **Step 3: Edit `App.tsx`** — additive only:

(a) Add imports near the existing ones:
```tsx
import { createMockCompositionGenerationClient } from "./lib/mockCompositionGenerationClient.js";
import { CompositionDemoScreen } from "./screens/CompositionEditor/CompositionDemoScreen.js";
```

(b) Add the route to the `Route` type:
```tsx
type Route = "create" | "editor" | "settings" | "composition";
```

(c) Add the client next to the existing `const generationClient = ...`:
```tsx
const compositionClient = createMockCompositionGenerationClient();
```

(d) Add a render branch BEFORE the final `// route === "create"` return:
```tsx
  if (state.route === "composition") {
    return <CompositionDemoScreen client={compositionClient} />;
  }
```

(e) In the `create` return, wrap the existing `<CreateDemoScreen ... />` so an additive entry button sits alongside it (do NOT modify `CreateDemoScreen` itself):
```tsx
  // route === "create"
  return (
    <>
      <CreateDemoScreen
        generationClient={generationClient}
        onProjectGenerated={handleProjectGenerated}
        onUseSampleProject={handleUseSampleProject}
        onReturnToEditor={handleReturnToEditor}
        hasInProgressProject={state.project !== undefined}
      />
      <button
        type="button"
        className="tk-btn"
        style={{ position: "fixed", right: 16, bottom: 16, zIndex: 10 }}
        onClick={() => setState((prev) => ({ ...prev, route: "composition" }))}
      >
        Composition demo (beta)
      </button>
    </>
  );
```

(The existing `CreateDemoScreen` props/usage are unchanged — only wrapped in a fragment with an added button.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/web test -- src/App.test.tsx`
Expected: PASS — the new test passes AND all existing App tests still pass (the create screen is unchanged; only an extra button was added).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): additive composition route + beta entry from create screen"
```

---

## Task 4: Full verification

- [ ] **Step 1: Web tests** — `pnpm --filter @tinker/web test` → PASS (all, incl. the new + the unchanged DemoProject tests).
- [ ] **Step 2: Editor tests** — `pnpm --filter @tinker/editor test` → PASS.
- [ ] **Step 3: Typecheck** — `pnpm --filter @tinker/web typecheck` → zero errors.
- [ ] **Step 4: Build** — `pnpm --filter @tinker/web build` → PASS.
- [ ] **Step 5:** Checkpoint only (commit any incidental fix; otherwise nothing to commit).

---

## Self-Review (done while writing)

- **Spec coverage:** Completes the data flow end-to-end in the app — a request generates a job (with a polling/cancel/error UX via the hook), and a completed job opens in `CompositionEditorScreen` via `selectArtifactUrl`. The mock client makes it deterministic/fast; the `HttpCompositionGenerationClient` is a one-line swap for real generation (where the ~10-min job + agent CLI + the real-browser cross-window smoke apply).
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `useCompositionGenerationJob`/`CompositionJobPhase`/`CompositionJobState` (Task 1) are used by `CompositionDemoScreen` (Task 2); the screen feeds `CompositionEditorScreen` (Phase 1d) via `selectArtifactUrl` (Phase 0). `App.tsx` mounts `CompositionDemoScreen` with the mock client. All additive — existing DemoProject types/flow untouched.
- **Non-destructive guarantee:** Task 3 only adds to `App.tsx` (new route + a fixed-position button wrapped in a fragment) and appends one App test; `CreateDemoScreen`/`EditorScreen`/the DemoProject `GenerationClient` are not modified, so the 51 existing web tests keep passing.

## Roadmap (remaining)

- **Real generation + real-browser smoke:** swap `createMockCompositionGenerationClient()` → `createHttpCompositionGenerationClient()` (behind an env/setting) and run a real `ai-url-planning` job end-to-end against the live API; verify the real iframe `window.__timelines` access works in a browser (the one path the unit-test `resolveWindow` seam mocks).
- **DemoProject retirement (separate, deliberate):** once the composition flow is proven, replace the create/editor flow — fold the composition entry into the primary Create Demo, retire the DemoProject `EditorScreen`/`GenerationClient`, and revise `docs/architecture.md`. This is the joint Person A + Person B cleanup the spec flags.
- **Phase 2 — AI chat editing:** drag-to-select-range + "add range/clip to chat" + the conversational edit loop (`POST /api/jobs/:id/edits`).
