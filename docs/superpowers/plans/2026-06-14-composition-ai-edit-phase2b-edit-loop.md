# Phase 2b — Composition AI chat-edit loop (mock) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the conversational edit loop to the composition editor: send an instruction + context chips → a new composition **revision** (via a deterministic mock client) → the preview hot-reloads → **Accept / Reject / Undo** over a client-side revision stack. No real API; the mock is the dev/test double the real `HttpCompositionEditClient` (Phase 3) will replace with no UI change.

**Architecture:** A `CompositionEditClient` interface (mirrors `CompositionGenerationClient`) with `MockCompositionEditClient`. A `useCompositionEditFlow` hook owns the revision stack + pending-revision state + abortable submit (mirrors `useCompositionGenerationJob`). `CompositionChatPanel` gains the edit states (enabled Send, drafting, Accept/Reject, error, Undo). `CompositionEditorScreen` threads `jobId` + the client, drives the preview `src` from the flow's current composition URL. All additive — Phase 2a behavior (no client) still works.

**Tech Stack:** React 18, TypeScript (strict), Vitest + jsdom + @testing-library/react. Spec: `docs/superpowers/specs/2026-06-14-composition-ai-edit-phase2-design.md`. Builds on Phase 2a (merged on this branch).

---

## File Structure

**Create:**
- `apps/web/src/lib/compositionEditClient.ts` — `CompositionEditRequest`, `CompositionRevision`, `CompositionEditClient` interface.
- `apps/web/src/lib/mockCompositionEditClient.ts` — deterministic mock.
- `apps/web/src/lib/mockCompositionEditClient.test.ts`
- `apps/web/src/screens/CompositionEditor/useCompositionEditFlow.ts` — revision stack + submit/accept/reject/undo.
- `apps/web/src/screens/CompositionEditor/useCompositionEditFlow.test.ts`

**Modify:**
- `apps/web/src/screens/CompositionEditor/CompositionChatPanel.tsx` — edit states (enabled Send, drafting, Accept/Reject, error, Undo). All new props OPTIONAL so Phase 2a tests stay green.
- `apps/web/src/screens/CompositionEditor/CompositionChatPanel.test.tsx` — add edit-state cases.
- `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx` — thread `jobId`/`editClient`, drive preview from the flow.
- `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx` — add edit-loop cases.
- `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx` — pass `editClient` + `jobId` through.
- `apps/web/src/App.tsx` — construct `createMockCompositionEditClient()` and pass it down.

**Do NOT touch:** `screens/Editor/**`, `ai-edit-ui`, `DemoProject`, `@tinker/demo-assembly`, `@tinker/generation-contract` (the `Revision` type is client-side, NOT an `ApiGenerationJob` extension).

**Commands:** `pnpm --filter @tinker/web exec vitest run <file>`; `pnpm --filter @tinker/web test`; `pnpm --filter @tinker/web typecheck`.

---

## Task 1: Edit client types + `MockCompositionEditClient`

**Files:** Create `apps/web/src/lib/compositionEditClient.ts`, `apps/web/src/lib/mockCompositionEditClient.ts`, `apps/web/src/lib/mockCompositionEditClient.test.ts`.

- [ ] **Step 1: Write the failing test** `apps/web/src/lib/mockCompositionEditClient.test.ts`:

```ts
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
    expect(r1.compositionIndexUrl).not.toBe(r2.compositionIndexUrl); // cache-busted so the iframe reloads
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
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @tinker/web exec vitest run src/lib/mockCompositionEditClient.test.ts`

- [ ] **Step 3: Implement** `apps/web/src/lib/compositionEditClient.ts`:

```ts
import type { ChatContextRef } from "./chatContext.js";

/** POST /api/jobs/:id/edits body. `jobId` is the path param; `context` empty = whole composition. */
export type CompositionEditRequest = {
  jobId: string;
  instruction: string;
  context: ChatContextRef[];
};

/** A composition revision — a client-side pointer over server-retained artifacts. NOT an ApiGenerationJob field. */
export type CompositionRevision = {
  id: string;
  compositionIndexUrl: string;
  outputVideoUrl?: string;
};

export type EditComposingOptions = {
  /** Coarse progress: the client emits "running" before resolving. */
  onUpdate?: (status: "running") => void;
  signal?: AbortSignal;
};

export interface CompositionEditClient {
  editComposition(request: CompositionEditRequest, options?: EditComposingOptions): Promise<CompositionRevision>;
}
```

Then `apps/web/src/lib/mockCompositionEditClient.ts`:

```ts
import type { CompositionEditClient } from "./compositionEditClient.js";

/**
 * Deterministic dev/test double for composition edits. It cannot re-render, so it
 * returns a revision pointing at the job's composition with a cache-busting `?rev=N`
 * query — distinct per edit so the preview iframe reloads (the real endpoint returns
 * genuinely new artifacts under revisions/<revId>/). Mirrors mockCompositionGenerationClient.
 */
export function createMockCompositionEditClient(): CompositionEditClient {
  let counter = 0;
  return {
    async editComposition(request, options) {
      options?.signal?.throwIfAborted();
      options?.onUpdate?.("running");
      counter += 1;
      const rev = counter;
      const base = `/api/jobs/${request.jobId}/artifacts/hyperframes`;
      return {
        id: `rev-${rev}`,
        compositionIndexUrl: `${base}/index.html?rev=${rev}`,
        outputVideoUrl: `${base}/output.mp4?rev=${rev}`,
      };
    },
  };
}
```

- [ ] **Step 4: Run → PASS (3).**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/compositionEditClient.ts apps/web/src/lib/mockCompositionEditClient.ts apps/web/src/lib/mockCompositionEditClient.test.ts
git commit -m "feat(web): CompositionEditClient interface + deterministic mock"
```

---

## Task 2: `useCompositionEditFlow` hook (revision stack + accept/reject/undo)

**Files:** Create `apps/web/src/screens/CompositionEditor/useCompositionEditFlow.ts` + `.test.ts`.

State: `stack: CompositionRevision[]` (accepted; starts `[baseRevision]`), `pending?: CompositionRevision` (drafted, awaiting accept/reject), `status`, `error`. Derived: `current = pending ?? stack[stack.length-1]`; `isPreviewing = pending !== undefined`; `canUndo = stack.length > 1`.

- [ ] **Step 1: Write the failing test** `useCompositionEditFlow.test.ts`:

```ts
import { renderHook, act, waitFor } from "@testing-library/react";
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
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `useCompositionEditFlow.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatContextRef } from "../../lib/chatContext.js";
import type { CompositionEditClient, CompositionRevision } from "../../lib/compositionEditClient.js";

export type EditFlowStatus = "idle" | "drafting" | "preview" | "error";

export type CompositionEditFlow = {
  status: EditFlowStatus;
  currentCompositionUrl: string;
  currentVideoUrl?: string;
  isPreviewing: boolean;
  canUndo: boolean;
  error?: string;
  submit: (instruction: string, context: ChatContextRef[]) => Promise<void>;
  accept: () => void;
  reject: () => void;
  undo: () => void;
  cancel: () => void;
};

export function useCompositionEditFlow(opts: {
  jobId: string;
  client: CompositionEditClient;
  baseRevision: CompositionRevision;
}): CompositionEditFlow {
  const { jobId, client, baseRevision } = opts;
  const [stack, setStack] = useState<CompositionRevision[]>([baseRevision]);
  const [pending, setPending] = useState<CompositionRevision | undefined>(undefined);
  const [status, setStatus] = useState<EditFlowStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const current = pending ?? stack[stack.length - 1]!;

  const submit = useCallback(
    async (instruction: string, context: ChatContextRef[]) => {
      if (instruction.trim() === "") return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("drafting");
      setError(undefined);
      try {
        const revision = await client.editComposition(
          { jobId, instruction, context },
          { signal: controller.signal, onUpdate: () => undefined },
        );
        if (controller.signal.aborted) return;
        setPending(revision);
        setStatus("preview");
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client, jobId],
  );

  const accept = useCallback(() => {
    setPending((p) => {
      if (p) setStack((s) => [...s, p]);
      return undefined;
    });
    setStatus("idle");
  }, []);

  const reject = useCallback(() => {
    setPending(undefined);
    setStatus("idle");
  }, []);

  const undo = useCallback(() => {
    setPending(undefined);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setStatus("idle");
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPending(undefined);
    setStatus("idle");
  }, []);

  return useMemo(
    () => ({
      status,
      currentCompositionUrl: current.compositionIndexUrl,
      ...(current.outputVideoUrl === undefined ? {} : { currentVideoUrl: current.outputVideoUrl }),
      isPreviewing: pending !== undefined,
      canUndo: stack.length > 1,
      ...(error === undefined ? {} : { error }),
      submit,
      accept,
      reject,
      undo,
      cancel,
    }),
    [status, current, pending, stack.length, error, submit, accept, reject, undo, cancel],
  );
}
```

- [ ] **Step 4: Run → PASS (6).**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/useCompositionEditFlow.ts apps/web/src/screens/CompositionEditor/useCompositionEditFlow.test.ts
git commit -m "feat(web): useCompositionEditFlow — revision stack + accept/reject/undo"
```

---

## Task 3: `CompositionChatPanel` edit states

**Files:** Modify `CompositionChatPanel.tsx` + add tests to `CompositionChatPanel.test.tsx`. All new props OPTIONAL (Phase 2a tests must stay green).

- [ ] **Step 1: Add failing tests** to `CompositionChatPanel.test.tsx`:

```tsx
  it("enables Send when onSend is provided and instruction is non-empty", () => {
    const onSend = vi.fn();
    render(<CompositionChatPanel {...props({ instruction: "punch in", onSend })} />);
    const send = screen.getByRole("button", { name: /send/i });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("disables Send while drafting and shows a drafting state", () => {
    render(<CompositionChatPanel {...props({ instruction: "x", onSend: () => undefined, status: "drafting" })} />);
    expect(screen.getByText(/drafting/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("shows Accept and Reject while previewing", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<CompositionChatPanel {...props({ status: "preview", isPreviewing: true, onAccept, onReject })} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject edit" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("shows an error message", () => {
    render(<CompositionChatPanel {...props({ status: "error", error: "Server error" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server error");
  });

  it("shows Undo when canUndo", () => {
    const onUndo = vi.fn();
    render(<CompositionChatPanel {...props({ canUndo: true, onUndo })} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo last edit" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run → the 5 new FAIL, the existing 4 PASS.**

- [ ] **Step 3: Implement.** Extend the props and body of `CompositionChatPanel.tsx`. New props (all optional):

```tsx
export type CompositionChatPanelProps = {
  instruction: string;
  onInstructionChange: (value: string) => void;
  contextRefs: ChatContextRef[];
  onRemoveRef: (id: string) => void;
  hasSelection: boolean;
  onAddToChat: () => void;
  onSend?: () => void;
  // 2b edit-loop state (all optional; absent = Phase 2a behavior):
  status?: "idle" | "drafting" | "preview" | "error";
  error?: string;
  isPreviewing?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
};
```

Destructure the new props (default `status` to `"idle"`). Compute `sendDisabled`:

```tsx
const drafting = status === "drafting";
const sendDisabled = onSend === undefined || instruction.trim() === "" || drafting;
```

In the bottom block, REPLACE the send button's `disabled={onSend === undefined}` with `disabled={sendDisabled}`, and ADD — directly above the textarea block — an edit-status region:

```tsx
{drafting ? (
  <div role="status" style={{ fontSize: 12.5, color: "var(--tk-text-sec)" }}>Drafting edit…</div>
) : null}
{status === "error" && error ? (
  <div role="alert" style={{ fontSize: 12.5, color: "var(--tk-danger, #C0392B)" }}>{error}</div>
) : null}
{isPreviewing ? (
  <div style={{ display: "flex", gap: 8 }}>
    <button type="button" className="tk-btn tk-btn-accent" aria-label="Accept edit" onClick={onAccept}>Accept</button>
    <button type="button" className="tk-btn" aria-label="Reject edit" onClick={onReject}>Reject</button>
  </div>
) : null}
{canUndo ? (
  <button type="button" className="tk-btn" aria-label="Undo last edit" onClick={onUndo} style={{ justifySelf: "start" }}>
    Undo last edit
  </button>
) : null}
```

Place these inside the bottom `<div style={{ display: "grid", gap: 8 }}>` (above the `<textarea>`), so they stack with the composer. Keep the `↑` Send button using `disabled={sendDisabled}`.

- [ ] **Step 4: Run → all CompositionChatPanel tests pass (4 existing + 5 new).**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/CompositionChatPanel.tsx apps/web/src/screens/CompositionEditor/CompositionChatPanel.test.tsx
git commit -m "feat(web): CompositionChatPanel edit states — Send/drafting/Accept-Reject/error/Undo"
```

---

## Task 4: Wire the edit loop into `CompositionEditorScreen` (+ Demo + App)

**Files:** Modify `CompositionEditorScreen.tsx` (+ test), `CompositionDemoScreen.tsx`, `App.tsx`.

The screen gains optional `jobId` + `editClient`. When BOTH are present it runs the edit loop; otherwise it behaves exactly as Phase 2a (Send disabled). Use a stable base revision from the incoming props.

- [ ] **Step 1: Add failing tests** to `CompositionEditorScreen.test.tsx`:

```tsx
  it("sends an instruction to the edit client and previews the returned revision", async () => {
    const handle = fakeHandle(() => undefined);
    const editComposition = vi.fn(async (req: { jobId: string; instruction: string; context: unknown[] }) => {
      expect(req.jobId).toBe("job-1");
      expect(req.instruction).toBe("punch in");
      return { id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1" };
    });
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        jobId="job-1"
        editClient={{ editComposition }}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Edit instruction"), { target: { value: "punch in" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(editComposition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toHaveAttribute("src", "/rev1/index.html?rev=1"));
    expect(screen.getByRole("button", { name: "Accept edit" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** In `CompositionEditorScreen.tsx`:

(a) Extend props + imports:
```tsx
import { useMemo, useState, type CSSProperties } from "react";
import type { CompositionEditClient, CompositionRevision } from "../../lib/compositionEditClient.js";
import { useCompositionEditFlow } from "./useCompositionEditFlow.js";
// ...existing imports...

export type CompositionEditorScreenProps = {
  compositionIndexUrl: string;
  outputVideoUrl?: string;
  onBack?: () => void;
  /** Enables the AI edit loop when provided together with editClient. */
  jobId?: string;
  editClient?: CompositionEditClient;
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};
```

(b) Build a stable base revision and run the flow (always call the hook — pass a no-op client when none, to keep hook order stable):
```tsx
const baseRevision: CompositionRevision = useMemo(
  () => ({ id: "rev-0", compositionIndexUrl, ...(outputVideoUrl === undefined ? {} : { outputVideoUrl }) }),
  [compositionIndexUrl, outputVideoUrl],
);
const noopClient = useMemo<CompositionEditClient>(() => ({ editComposition: async () => baseRevision }), [baseRevision]);
const edit = useCompositionEditFlow({ jobId: jobId ?? "", client: editClient ?? noopClient, baseRevision });
const editEnabled = jobId !== undefined && editClient !== undefined;
```

(c) Drive the preview from the flow, and clear the composer on submit:
```tsx
function handleSend() {
  void edit.submit(instruction, contextRefs);
  setInstruction("");
  setContextRefs([]);
}
```

In the `<CompositionPreview>`, replace `src={compositionIndexUrl}` with `src={edit.currentCompositionUrl}` and `fallbackVideoSrc={outputVideoUrl}` with `fallbackVideoSrc={edit.currentVideoUrl}`.

In `<CompositionChatPanel>`, pass the edit props:
```tsx
<CompositionChatPanel
  instruction={instruction}
  onInstructionChange={setInstruction}
  contextRefs={contextRefs}
  onRemoveRef={handleRemoveRef}
  hasSelection={selection !== undefined}
  onAddToChat={handleAddToChat}
  {...(editEnabled ? { onSend: handleSend } : {})}
  status={edit.status}
  isPreviewing={edit.isPreviewing}
  onAccept={edit.accept}
  onReject={edit.reject}
  canUndo={edit.canUndo}
  onUndo={edit.undo}
  {...(edit.error === undefined ? {} : { error: edit.error })}
/>
```

> Note: the preview re-reads `window.__timelines` on `src` change (its `key` includes `src`), so `model` updates for the new revision automatically — no extra wiring. When `editEnabled` is false, `onSend` is omitted ⇒ Send stays disabled (Phase 2a behavior), and the existing 2a tests (which pass no `jobId`/`editClient`) are unchanged.

(d) `CompositionDemoScreen.tsx` — accept `editClient` and pass it + `jobId`:
```tsx
export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  editClient?: CompositionEditClient;
  onBack?: () => void;
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};
```
Add `import type { CompositionEditClient } from "../../lib/compositionEditClient.js";`. In the completed/editor branch, pass `jobId={job.job.id}` and `{...(editClient ? { editClient } : {})}` to `<CompositionEditorScreen>`.

(e) `App.tsx` — construct and pass the mock edit client:
```tsx
import { createMockCompositionEditClient } from "./lib/mockCompositionEditClient.js";
// near the other client singletons:
const compositionEditClient = createMockCompositionEditClient();
// in the composition route:
<CompositionDemoScreen
  client={compositionClient}
  editClient={compositionEditClient}
  onBack={() => setState((prev) => ({ ...prev, route: "create" }))}
/>
```

- [ ] **Step 4: Run the screen tests + full web + editor suites + typechecks:**
- `pnpm --filter @tinker/web exec vitest run src/screens/CompositionEditor/CompositionEditorScreen.test.tsx` → all pass (2a + new).
- `pnpm --filter @tinker/web test` ; `pnpm --filter @tinker/editor test` → all green (legacy untouched).
- `pnpm --filter @tinker/web typecheck` → exit 0 (run `pnpm --filter @tinker/editor build` first if it complains about stale editor dist).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx apps/web/src/App.tsx
git commit -m "feat(web): wire composition edit loop — jobId + edit client + revision-driven preview"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** MockCompositionEditClient (Task 1) ✓; useCompositionEditFlow + revision stack + Accept/Reject/Undo (Task 2) ✓; live chat Send + drafting/preview/error/Undo states (Task 3) ✓; preview hot-reload to revision + jobId threading + seam-ready (Task 4) ✓; `Revision`/`CompositionEditRequest` client-side, generation-contract untouched ✓; non-destructive ✓.

**Placeholder scan:** none — every step has complete code + tests.

**Type consistency:** `CompositionRevision` (`{id, compositionIndexUrl, outputVideoUrl?}`), `CompositionEditRequest` (`{jobId, instruction, context}`), `CompositionEditClient.editComposition(request, options?)`, `CompositionEditFlow` shape, and `CompositionChatPanel` optional edit props are consistent across Tasks 1→4. The hook is always called (stable hook order) with a no-op client when edits are disabled. The screen omits `onSend` when `editEnabled` is false, preserving Phase 2a Send-disabled tests.

**Out of scope (Phase 3+):** real `HttpCompositionEditClient`/`POST /api/jobs/:id/edits`, the `revisions` schema change, thumbnails, clip scene-lint.
