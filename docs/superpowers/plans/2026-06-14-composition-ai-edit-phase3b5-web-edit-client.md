# Phase 3b-5 — Web: real edit client + bounded replay + Reprompt — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Swap the Phase-2 mock edit client for a real `HttpCompositionEditClient`
(POST `/edits` → poll → map the new revision), play **only the edited clip on loop**
when a revision previews, and keep the composer scoped during preview so the user can
**Reprompt**. The `CompositionEditClient` interface is unchanged, so the editor UI
(Accept/Reject/Undo from 2b) keeps working.

**Tech stack:** React, TS strict, Vitest + jsdom + @testing-library/react. Spec:
`…phase3-real-pipeline.md` (3b-5). Builds on Phase 2b's `useCompositionEditFlow`,
`CompositionChatPanel`, `useCompositionPlayback`.

---

## File Structure
**Create:** `apps/web/src/lib/httpCompositionEditClient.ts` (+test).
**Modify:** `apps/web/src/screens/CompositionEditor/useCompositionPlayback.ts` (+test); `apps/web/src/App.tsx`; `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx` (+test).
**Commands:** `pnpm --filter @tinker/web test|typecheck`.

---

## Task 1: `HttpCompositionEditClient`

**Files:** `apps/web/src/lib/httpCompositionEditClient.ts` + `.test.ts`. Mirror
`httpCompositionGenerationClient.ts` (baseUrl/fetchFn/`safeParseApiGenerationJob`/poll).

- [ ] **Step 1: Failing test** `httpCompositionEditClient.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { createHttpCompositionEditClient } from "./httpCompositionEditClient.js";
import type { ApiGenerationJob } from "@tinker/generation-contract";

function job(over: Partial<ApiGenerationJob>): ApiGenerationJob {
  return {
    id: "job-1", status: "completed",
    request: { id: "job-1", mode: "ai-url-planning", repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9", renderer: "hyperframes" },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    progressEvents: [], result: { artifacts: [] }, ...over,
  } as ApiGenerationJob;
}
const res = (j: ApiGenerationJob, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });

describe("createHttpCompositionEditClient", () => {
  it("POSTs the edit then polls until the new revision and maps its artifacts", async () => {
    const before = job({ revisions: [] });
    const after = job({
      currentRevisionId: "rev-1",
      revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:01.000Z", result: { artifacts: [
        { kind: "composition-index", relativePath: "revisions/rev-1/hyperframes/index.html", url: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/index.html", mediaType: "text/html" },
        { kind: "output-video", relativePath: "revisions/rev-1/hyperframes/output.mp4", url: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/output.mp4", mediaType: "video/mp4" },
      ] } }],
    });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res(before, 202))  // POST /edits
      .mockResolvedValueOnce(res(after));        // GET poll
    const client = createHttpCompositionEditClient({ fetchFn: fetchFn as unknown as typeof fetch, intervalMs: 0 });
    const rev = await client.editComposition({ jobId: "job-1", instruction: "punch in", context: [] });
    expect(rev).toEqual({ id: "rev-1", compositionIndexUrl: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/index.html", outputVideoUrl: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/output.mp4" });
    expect(fetchFn).toHaveBeenNthCalledWith(1, expect.stringContaining("/api/jobs/job-1/edits"), expect.objectContaining({ method: "POST" }));
  });

  it("throws when the new revision failed", async () => {
    const before = job({ revisions: [] });
    const after = job({ revisions: [{ id: "rev-1", status: "failed", createdAt: "2026-01-01T00:00:01.000Z", error: { status: "failed", stage: "unknown", message: "agent boom" } }] });
    const fetchFn = vi.fn().mockResolvedValueOnce(res(before, 202)).mockResolvedValueOnce(res(after));
    const client = createHttpCompositionEditClient({ fetchFn: fetchFn as unknown as typeof fetch, intervalMs: 0 });
    await expect(client.editComposition({ jobId: "job-1", instruction: "x", context: [] })).rejects.toThrow(/agent boom/);
  });
});
```
- [ ] **Step 2: Run → FAIL.** `pnpm --filter @tinker/web exec vitest run src/lib/httpCompositionEditClient.test.ts`
- [ ] **Step 3: Implement** `apps/web/src/lib/httpCompositionEditClient.ts`:
```ts
import { safeParseApiGenerationJob, type ApiGenerationJob } from "@tinker/generation-contract";
import type { CompositionEditClient, CompositionEditRequest, CompositionRevision, EditComposeOptions } from "./compositionEditClient.js";

export type HttpCompositionEditClientOptions = { baseUrl?: string; fetchFn?: typeof fetch; intervalMs?: number };

const DEFAULT_POLL_INTERVAL_MS = 1500;

export function createHttpCompositionEditClient(options: HttpCompositionEditClientOptions = {}): CompositionEditClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  async function readJob(response: Response): Promise<ApiGenerationJob> {
    if (!response.ok) throw new Error(await readErrorMessage(response));
    let raw: unknown;
    try { raw = await response.json(); } catch { throw new Error(`Server returned a non-JSON response (status ${response.status})`); }
    const parsed = safeParseApiGenerationJob(raw);
    if (!parsed.success) throw new Error(`Malformed job response: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    return parsed.data;
  }

  return {
    async editComposition(request: CompositionEditRequest, opts?: EditComposeOptions): Promise<CompositionRevision> {
      opts?.signal?.throwIfAborted();
      const posted = await readJob(await fetchFn(`${baseUrl}/api/jobs/${request.jobId}/edits`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: request.instruction, context: request.context }),
        signal: opts?.signal,
      }));
      opts?.onUpdate?.("running");
      const prevCount = posted.revisions?.length ?? 0;

      for (;;) {
        opts?.signal?.throwIfAborted();
        const job = await readJob(await fetchFn(`${baseUrl}/api/jobs/${request.jobId}`, { signal: opts?.signal }));
        const revisions = job.revisions ?? [];
        if (revisions.length > prevCount) {
          const rev = revisions[revisions.length - 1]!;
          if (rev.status === "failed") throw new Error(rev.error?.message ?? "Edit failed");
          const arts = rev.result?.artifacts ?? [];
          const compositionIndexUrl = arts.find((a) => a.kind === "composition-index")?.url;
          if (compositionIndexUrl === undefined) throw new Error("Edit completed but produced no composition");
          const outputVideoUrl = arts.find((a) => a.kind === "output-video")?.url;
          return { id: rev.id, compositionIndexUrl, ...(outputVideoUrl === undefined ? {} : { outputVideoUrl }) };
        }
        await delay(intervalMs, opts?.signal);
      }
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try { const j = (await response.json()) as { message?: unknown }; if (typeof j?.message === "string" && j.message.length > 0) return j.message; } catch { /* not json */ }
  return `Request failed with status ${response.status}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError")); return; }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError")); }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
```
- [ ] **Step 4: Run → PASS. Step 5: typecheck + commit.**
```bash
git add apps/web/src/lib/httpCompositionEditClient.ts apps/web/src/lib/httpCompositionEditClient.test.ts
git commit -m "feat(web): HttpCompositionEditClient — POST /edits + poll + map revision"
```

---

## Task 2: bounded-range loop in `useCompositionPlayback`

**Files:** modify `useCompositionPlayback.ts` + extend its test.

- [ ] **Step 1: Failing test** — append to `useCompositionPlayback.test.ts`:
```ts
  it("playSegment loops within [start, end]", () => {
    const cbs = stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(10));
    act(() => result.current.playSegment(4, 6));
    expect(result.current.currentTime).toBe(4);
    expect(result.current.isPlaying).toBe(true);
    act(() => cbs.shift()?.(0));
    act(() => cbs.shift()?.(3000)); // +3s would reach 7 (>6) → wraps to 4
    expect(result.current.currentTime).toBe(4);
    expect(result.current.isPlaying).toBe(true); // still looping (does not stop)
  });
```
(reuse the file's `stubRaf` helper.)
- [ ] **Step 2: Run → FAIL** (`playSegment` missing).
- [ ] **Step 3: Implement** — add to the type + hook. Add `playSegment: (start: number, end: number) => void;` to `CompositionPlayback`. Add a `loopRangeRef`:
```ts
  const loopRangeRef = useRef<{ start: number; end: number } | null>(null);
```
In the rAF `tick`, replace the upper-bound logic:
```ts
      const loop = loopRangeRef.current;
      const upper = loop ? loop.end : duration;
      let next = currentRef.current + delta;
      if (next >= upper) {
        if (loop) { next = loop.start; setCurrentTime(next); lastRef.current = ts; rafRef.current = requestAnimationFrame(tick); return; }
        setCurrentTime(upper); setIsPlaying(false); lastRef.current = null; return;
      }
      setCurrentTime(next);
      rafRef.current = requestAnimationFrame(tick);
```
(remove the old `const next = Math.min(...)` + `if (next >= duration)` lines.) Add `play`/`pause`/`seek` clear or set the loop range:
```ts
  const play = useCallback(() => { loopRangeRef.current = null; setCurrentTime((t) => (duration > 0 && t >= duration ? 0 : t)); setIsPlaying(true); }, [duration]);
  const pause = useCallback(() => { setIsPlaying(false); }, []);
  const seek = useCallback((time: number) => { loopRangeRef.current = null; setCurrentTime(Math.max(0, Math.min(time, duration > 0 ? duration : 0))); }, [duration]);
  const playSegment = useCallback((start: number, end: number) => {
    loopRangeRef.current = { start: Math.max(0, start), end: Math.max(start, end) };
    setCurrentTime(Math.max(0, start));
    setIsPlaying(true);
  }, []);
```
Return `playSegment` in the object. Keep the existing tests green (full `play` still stops at duration since `loopRangeRef` is null).
- [ ] **Step 4: Run → PASS (existing + new). Step 5: commit.**
```bash
git add apps/web/src/screens/CompositionEditor/useCompositionPlayback.ts apps/web/src/screens/CompositionEditor/useCompositionPlayback.test.ts
git commit -m "feat(web): useCompositionPlayback.playSegment — loop a bounded [start,end] range"
```

---

## Task 3: wire the real edit client + auto-replay the edited clip + Reprompt

**Files:** `App.tsx`; `CompositionEditorScreen.tsx` + its test.

- [ ] **Step 1: Failing test** — append to `CompositionEditorScreen.test.tsx`:
```ts
  it("after an edit previews, the chips stay (Reprompt scope) and Accept is offered", async () => {
    const handle = fakeHandle(() => undefined);
    const editComposition = vi.fn(async () => ({ id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1" }));
    render(<CompositionEditorScreen compositionIndexUrl={INDEX} outputVideoUrl={VIDEO} jobId="job-1" editClient={{ editComposition }} resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })} />);
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    fireEvent.click(screen.getByRole("button", { name: "Add selection to chat" }));
    fireEvent.change(screen.getByLabelText("Edit instruction"), { target: { value: "punch in" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept edit" })).toBeInTheDocument());
    // Reprompt scope preserved: the clip chip is still present during preview
    expect(screen.getByRole("button", { name: "Remove feature from chat" })).toBeInTheDocument();
  });
```
> This supersedes the Phase-2b assumption that chips clear on send. Update the existing screen behaviour: clear the **instruction** on send, but KEEP `contextRefs` until Accept/Reject (so Send-during-preview reprompts the same clip). If a prior 2b test asserts chips clear on send, update it to the new behaviour.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
  - `App.tsx`: `import { createHttpCompositionEditClient } from "./lib/httpCompositionEditClient.js";` and replace `const compositionEditClient = createMockCompositionEditClient();` with `createHttpCompositionEditClient();` (keep the mock import only if still used elsewhere — remove it if not).
  - `CompositionEditorScreen.tsx`:
    - `handleSend`: clear `instruction` only; do NOT clear `contextRefs`. Capture the edited range: `const refs = contextRefs; const editedRange = refs.length ? { start: Math.min(...refs.map(r => r.start)), end: Math.max(...refs.map(r => r.end)) } : undefined;` store in a ref/state `lastEditedRange`.
    - Clear `contextRefs` + selection on Accept/Reject. The edit props are passed via the **gated spread object** (`CompositionEditorScreen.tsx` ~lines 158-169) — wrap inside that object, NOT as JSX props: `onAccept: () => { edit.accept(); setContextRefs([]); setSelection(undefined); },` and `onReject: () => { edit.reject(); setContextRefs([]); setSelection(undefined); },`.
    - Auto-replay: add an effect keyed on **`edit.currentCompositionUrl`** (which changes per revision — NOT the `isPreviewing` boolean, which stays true across a Reprompt and would not re-fire). Guard with `if (edit.isPreviewing && model && lastEditedRange) playback.playSegment(lastEditedRange.start, lastEditedRange.end);`. This re-replays the edited clip for EACH new revision (including reprompts).
- [ ] **Step 4: Run the screen tests + full web suite + typecheck.** Update any 2b test that asserted chips clear on send. `pnpm --filter @tinker/web test` green; `pnpm --filter @tinker/web typecheck` clean.
- [ ] **Step 5: commit.**
```bash
git add apps/web/src/App.tsx apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx
git commit -m "feat(web): wire real edit client + auto-replay edited clip + keep chips for Reprompt"
```

---

## Self-Review (plan author)

**Spec coverage (3b-5):** `HttpCompositionEditClient` swapping the mock with no
interface change (Task 1) — POST `/edits` + poll + map the new revision's
composition-index/output-video; failed revision → throw. Bounded-range loop replay
(Task 2). Wiring + **auto-replay the edited clip on preview** + **Reprompt** (chips
stay scoped during preview so Send re-sends the same clip) (Task 3).

**Type consistency:** `CompositionEditClient`/`CompositionRevision`/`CompositionEditRequest`
(unchanged from 2b) — the HTTP client fulfils the interface the UI already consumes, so
`useCompositionEditFlow` needs no change. `playSegment` is additive on `CompositionPlayback`.

**Risks:** the auto-replay effect must not loop-thrash — gate it on the `isPreviewing`
transition (not every render) and a ready `model`. The Task 3 test focuses on the
Reprompt-scope behaviour (deterministic in jsdom); the live segment playback is verified
by the existing rAF tests (Task 2) + manual smoke. Out of scope: export (3c).
