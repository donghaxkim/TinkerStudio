# Composition AI Editing — Phase 0: Generation Client + API Wiring (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app a fully-tested data layer that talks to Person A's real generation API (`POST /api/jobs` + poll `GET /api/jobs/:id`), returns composition artifacts by `kind`, and is reachable from the dev server via a `/api` proxy.

**Architecture:** A new **composition-dialect** client (the API returns `ApiGenerationJob` with `result.artifacts`, not the old `GenerationJob`+`DemoProject`). Three small files in `apps/web/src/lib`: a pure interface + helpers, an HTTP implementation (injectable `fetch` for tests), and a deterministic mock for dev/tests. Plus a one-line Vite proxy. No UI is rewired in this phase — that lands with Phase 1 (preview), so this phase is self-contained and unit-testable.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest (jsdom env), Zod validators from `@tinker/generation-contract`, Vite dev proxy.

**Branch:** `person-b/composition-ai-edit` (already created, synced with `origin/main`).

**Spec:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md` (Component §1).

---

## Contract facts this plan is built on (verified)

- `POST /api/jobs` body = `{ mode: "ai-url-planning", repoUrl, productUrl, durationCapSeconds, aspectRatio, prompt?, renderer? }` (`.strict()`; the route strips any `id`). Returns **202** + an `ApiGenerationJob` snapshot. `422` → `{ status, stage, message }`. `429` → `{ message }`.
- ⚠️ **`renderer` defaults to `"playwright"` server-side if omitted.** For composition output the client MUST send `renderer: "hyperframes"`.
- `GET /api/jobs/:id` → **200** `ApiGenerationJob`, or **404** `{ message }`.
- `ApiGenerationJob` = `{ id, status, request, createdAt, updatedAt, progressEvents[], result?, error? }`. `status ∈ queued | running | capturing | assembling | completed | failed`. `result` only when `completed`; `error` only when `failed`. `result.artifacts[]` = `{ kind, relativePath, url, mediaType? }`.
- Exported from `@tinker/generation-contract` root (verified): `ApiArtifact`, `ApiArtifactKind`, `ApiGenerationJob`, `ApiGenerationJobStatus`, `safeParseApiGenerationJob`.
- Web tests: `pnpm --filter @tinker/web test -- <path>` (Vitest, jsdom). Imports use `.js` specifiers.

---

## File Structure

- Create: `apps/web/src/lib/compositionGenerationClient.ts` — interface + `CreateCompositionJobRequest` + `isTerminalStatus` / `selectArtifact` / `selectArtifactUrl`.
- Create: `apps/web/src/lib/compositionGenerationClient.test.ts` — helper unit tests.
- Create: `apps/web/src/lib/httpCompositionGenerationClient.ts` — `createHttpCompositionGenerationClient`.
- Create: `apps/web/src/lib/httpCompositionGenerationClient.test.ts` — HTTP tests (fake `fetch`).
- Create: `apps/web/src/lib/mockCompositionGenerationClient.ts` — `createMockCompositionGenerationClient`.
- Create: `apps/web/src/lib/mockCompositionGenerationClient.test.ts` — mock tests.
- Modify: `apps/web/vite.config.ts` — add `server.proxy["/api"]`.

---

## Task 1: Client interface + artifact helpers

**Files:**
- Create: `apps/web/src/lib/compositionGenerationClient.ts`
- Test: `apps/web/src/lib/compositionGenerationClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/compositionGenerationClient.test.ts
import { describe, expect, it } from "vitest";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import { isTerminalStatus, selectArtifact, selectArtifactUrl } from "./compositionGenerationClient.js";

const completed = {
  id: "job-1",
  status: "completed",
  request: {
    id: "job-1",
    mode: "ai-url-planning",
    repoUrl: "https://github.com/acme/driftboard",
    productUrl: "https://driftboard.example.com",
    durationCapSeconds: 60,
    aspectRatio: "16:9",
    renderer: "hyperframes",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progressEvents: [],
  result: {
    artifacts: [
      { kind: "composition-index", relativePath: "hyperframes/index.html", url: "/api/jobs/job-1/artifacts/hyperframes/index.html", mediaType: "text/html" },
      { kind: "output-video", relativePath: "hyperframes/output.mp4", url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4", mediaType: "video/mp4" },
    ],
  },
} as ApiGenerationJob;

describe("composition client helpers", () => {
  it("isTerminalStatus is true only for completed/failed", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("queued")).toBe(false);
  });

  it("selects an artifact and its url by kind", () => {
    expect(selectArtifactUrl(completed, "composition-index")).toBe("/api/jobs/job-1/artifacts/hyperframes/index.html");
    expect(selectArtifact(completed, "output-video")?.mediaType).toBe("video/mp4");
    expect(selectArtifactUrl(completed, "lint-log")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/web test -- src/lib/compositionGenerationClient.test.ts`
Expected: FAIL — cannot find module `./compositionGenerationClient.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/compositionGenerationClient.ts
import type {
  ApiArtifact,
  ApiArtifactKind,
  ApiGenerationJob,
  ApiGenerationJobStatus,
} from "@tinker/generation-contract";

/** The POST /api/jobs body: an ai-url-planning request minus server-derived fields. */
export type CreateCompositionJobRequest = {
  mode: "ai-url-planning";
  repoUrl: string;
  productUrl: string;
  durationCapSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  prompt?: string;
  /** Defaults to "hyperframes" in the HTTP client if omitted (the server defaults to playwright). */
  renderer?: "hyperframes" | "playwright" | "both";
};

export type WaitForJobOptions = {
  intervalMs?: number;
  onUpdate?: (job: ApiGenerationJob) => void;
  signal?: AbortSignal;
};

export interface CompositionGenerationClient {
  createJob(request: CreateCompositionJobRequest): Promise<ApiGenerationJob>;
  getJob(jobId: string): Promise<ApiGenerationJob>;
  waitForJob(jobId: string, options?: WaitForJobOptions): Promise<ApiGenerationJob>;
}

export function isTerminalStatus(status: ApiGenerationJobStatus): boolean {
  return status === "completed" || status === "failed";
}

export function selectArtifact(job: ApiGenerationJob, kind: ApiArtifactKind): ApiArtifact | undefined {
  return job.result?.artifacts.find((artifact) => artifact.kind === kind);
}

export function selectArtifactUrl(job: ApiGenerationJob, kind: ApiArtifactKind): string | undefined {
  return selectArtifact(job, kind)?.url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/web test -- src/lib/compositionGenerationClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/compositionGenerationClient.ts apps/web/src/lib/compositionGenerationClient.test.ts
git commit -m "feat(web): composition generation client interface + artifact helpers"
```

---

## Task 2: HTTP client (`createHttpCompositionGenerationClient`)

**Files:**
- Create: `apps/web/src/lib/httpCompositionGenerationClient.ts`
- Test: `apps/web/src/lib/httpCompositionGenerationClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/httpCompositionGenerationClient.test.ts
import { describe, expect, it, vi } from "vitest";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import { createHttpCompositionGenerationClient } from "./httpCompositionGenerationClient.js";

function jsonResponse(status: number, data: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as unknown as Response;
}

function job(overrides: Partial<ApiGenerationJob> = {}): ApiGenerationJob {
  return {
    id: "job-1",
    status: "queued",
    request: {
      id: "job-1",
      mode: "ai-url-planning",
      repoUrl: "https://github.com/acme/driftboard",
      productUrl: "https://driftboard.example.com",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      renderer: "hyperframes",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    progressEvents: [],
    ...overrides,
  } as ApiGenerationJob;
}

const validRequest = {
  mode: "ai-url-planning",
  repoUrl: "https://github.com/acme/driftboard",
  productUrl: "https://driftboard.example.com",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
} as const;

describe("HttpCompositionGenerationClient", () => {
  it("POSTs ai-url-planning to /api/jobs and forces renderer=hyperframes", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(202, job()));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    const created = await client.createJob(validRequest);
    expect(created.status).toBe("queued");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("/api/jobs");
    expect(init?.method).toBe("POST");
    const sent = JSON.parse((init?.body as string) ?? "{}");
    expect(sent.renderer).toBe("hyperframes");
    expect(sent.mode).toBe("ai-url-planning");
  });

  it("throws the server message on a 422 validation error", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(422, { status: "failed", stage: "validation", message: "repoUrl: required" }));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    await expect(client.createJob(validRequest)).rejects.toThrow("repoUrl: required");
  });

  it("GETs a job by id", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, job({ status: "running" })));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    const got = await client.getJob("job-1");
    expect(got.status).toBe("running");
    expect(fetchFn.mock.calls[0]![0]).toBe("/api/jobs/job-1");
  });

  it("waitForJob polls until terminal and reports each update", async () => {
    const completed = job({
      status: "completed",
      result: { artifacts: [{ kind: "output-video", relativePath: "hyperframes/output.mp4", url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4", mediaType: "video/mp4" }] },
    });
    const responses = [jsonResponse(200, job({ status: "running" })), jsonResponse(200, completed)];
    const fetchFn = vi.fn(async () => responses.shift()!);
    const client = createHttpCompositionGenerationClient({ fetchFn });
    const seen: string[] = [];
    const result = await client.waitForJob("job-1", { intervalMs: 0, onUpdate: (j) => seen.push(j.status) });
    expect(result.status).toBe("completed");
    expect(seen).toEqual(["running", "completed"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/web test -- src/lib/httpCompositionGenerationClient.test.ts`
Expected: FAIL — cannot find module `./httpCompositionGenerationClient.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/httpCompositionGenerationClient.ts
import { safeParseApiGenerationJob, type ApiGenerationJob } from "@tinker/generation-contract";
import {
  isTerminalStatus,
  type CompositionGenerationClient,
  type CreateCompositionJobRequest,
  type WaitForJobOptions,
} from "./compositionGenerationClient.js";

export type HttpCompositionGenerationClientOptions = {
  /** Base URL for the API. Default "" → same-origin via the Vite dev proxy. */
  baseUrl?: string;
  /** Injectable fetch for tests. Default: global fetch. */
  fetchFn?: typeof fetch;
};

const DEFAULT_POLL_INTERVAL_MS = 1500;

export function createHttpCompositionGenerationClient(
  options: HttpCompositionGenerationClientOptions = {},
): CompositionGenerationClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;

  async function readJob(response: Response): Promise<ApiGenerationJob> {
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const parsed = safeParseApiGenerationJob(await response.json());
    if (!parsed.success) {
      throw new Error(`Malformed job response: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
    }
    return parsed.data;
  }

  async function getJob(jobId: string): Promise<ApiGenerationJob> {
    return readJob(await fetchFn(`${baseUrl}/api/jobs/${jobId}`));
  }

  return {
    async createJob(request: CreateCompositionJobRequest): Promise<ApiGenerationJob> {
      const body = { renderer: "hyperframes" as const, ...request };
      return readJob(
        await fetchFn(`${baseUrl}/api/jobs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    getJob,
    async waitForJob(jobId: string, waitOptions: WaitForJobOptions = {}): Promise<ApiGenerationJob> {
      const intervalMs = waitOptions.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      for (;;) {
        waitOptions.signal?.throwIfAborted();
        const job = await getJob(jobId);
        waitOptions.onUpdate?.(job);
        if (isTerminalStatus(job.status)) {
          return job;
        }
        await delay(intervalMs, waitOptions.signal);
      }
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: unknown };
    if (typeof json?.message === "string" && json.message.length > 0) {
      return json.message;
    }
  } catch {
    // body was not JSON; fall through
  }
  return `Request failed with status ${response.status}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/web test -- src/lib/httpCompositionGenerationClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/httpCompositionGenerationClient.ts apps/web/src/lib/httpCompositionGenerationClient.test.ts
git commit -m "feat(web): HTTP composition generation client (create/get/poll)"
```

---

## Task 3: Deterministic mock client (`createMockCompositionGenerationClient`)

**Files:**
- Create: `apps/web/src/lib/mockCompositionGenerationClient.ts`
- Test: `apps/web/src/lib/mockCompositionGenerationClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/mockCompositionGenerationClient.test.ts
import { describe, expect, it } from "vitest";
import { selectArtifactUrl } from "./compositionGenerationClient.js";
import { createMockCompositionGenerationClient } from "./mockCompositionGenerationClient.js";

const request = {
  mode: "ai-url-planning",
  repoUrl: "https://github.com/acme/driftboard",
  productUrl: "https://driftboard.example.com",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
} as const;

describe("MockCompositionGenerationClient", () => {
  it("creates a non-terminal job, then completes with composition + video artifacts", async () => {
    const client = createMockCompositionGenerationClient();
    const created = await client.createJob(request);
    expect(["queued", "running"]).toContain(created.status);

    const done = await client.waitForJob(created.id, { intervalMs: 0 });
    expect(done.status).toBe("completed");
    expect(selectArtifactUrl(done, "composition-index")).toContain("index.html");
    expect(selectArtifactUrl(done, "output-video")).toContain("output.mp4");
  });

  it("getJob throws for an unknown id", async () => {
    const client = createMockCompositionGenerationClient();
    await expect(client.getJob("nope")).rejects.toThrow("Unknown mock composition job 'nope'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/web test -- src/lib/mockCompositionGenerationClient.test.ts`
Expected: FAIL — cannot find module `./mockCompositionGenerationClient.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/mockCompositionGenerationClient.ts
import type { ApiGenerationJob } from "@tinker/generation-contract";
import {
  type CompositionGenerationClient,
  type CreateCompositionJobRequest,
  type WaitForJobOptions,
} from "./compositionGenerationClient.js";

const FIXED_TIME = "2026-01-01T00:00:00.000Z";

function completedJob(id: string, request: CreateCompositionJobRequest): ApiGenerationJob {
  return {
    id,
    status: "completed",
    request: {
      id,
      mode: "ai-url-planning",
      repoUrl: request.repoUrl,
      productUrl: request.productUrl,
      durationCapSeconds: request.durationCapSeconds,
      aspectRatio: request.aspectRatio,
      renderer: request.renderer ?? "hyperframes",
      ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
    },
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    progressEvents: [],
    result: {
      artifacts: [
        { kind: "composition-index", relativePath: "hyperframes/index.html", url: `/api/jobs/${id}/artifacts/hyperframes/index.html`, mediaType: "text/html" },
        { kind: "output-video", relativePath: "hyperframes/output.mp4", url: `/api/jobs/${id}/artifacts/hyperframes/output.mp4`, mediaType: "video/mp4" },
      ],
    },
  } as ApiGenerationJob;
}

export function createMockCompositionGenerationClient(): CompositionGenerationClient {
  const jobs = new Map<string, ApiGenerationJob>();
  let counter = 0;

  async function getJob(jobId: string): Promise<ApiGenerationJob> {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown mock composition job '${jobId}'`);
    }
    return job;
  }

  return {
    async createJob(request: CreateCompositionJobRequest): Promise<ApiGenerationJob> {
      counter += 1;
      const id = `mock-job-${counter}`;
      const done = completedJob(id, request);
      jobs.set(id, done);
      // Surface a non-terminal snapshot first so callers exercise the poll path.
      return { ...done, status: "running", result: undefined } as ApiGenerationJob;
    },
    getJob,
    async waitForJob(jobId: string, options: WaitForJobOptions = {}): Promise<ApiGenerationJob> {
      const job = await getJob(jobId);
      options.onUpdate?.(job);
      return job;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/web test -- src/lib/mockCompositionGenerationClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/mockCompositionGenerationClient.ts apps/web/src/lib/mockCompositionGenerationClient.test.ts
git commit -m "feat(web): deterministic mock composition generation client"
```

---

## Task 4: Vite dev proxy `/api` → `127.0.0.1:4500`

**Files:**
- Modify: `apps/web/vite.config.ts` (the `server` block)

- [ ] **Step 1: Add the proxy to the existing `server` block**

Find:

```ts
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
```

Replace with:

```ts
  server: {
    proxy: {
      // Forward API calls to Person A's local generation server (TINKER_API_PORT, default 4500).
      "/api": "http://127.0.0.1:4500",
    },
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
```

- [ ] **Step 2: Typecheck the web app**

Run: `pnpm --filter @tinker/web typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Manual end-to-end proxy check**

In terminal A: `pnpm --filter @tinker/api dev` (expect log: `Tinker API listening at http://127.0.0.1:4500`).
In terminal B: `pnpm --filter @tinker/web dev` (Vite on `http://localhost:5173`).
In terminal C: `curl -s http://localhost:5173/api/health`
Expected: `{"ok":true}` (proxied through Vite to the API).

- [ ] **Step 4: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "chore(web): proxy /api to the local generation server (127.0.0.1:4500)"
```

---

## Task 5: Full phase verification

- [ ] **Step 1: Run the whole web test suite**

Run: `pnpm --filter @tinker/web test`
Expected: PASS — all prior web tests plus the 8 new tests (Tasks 1–3) green.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @tinker/web typecheck`
Expected: PASS.

- [ ] **Step 3: Confirm no regressions in the build**

Run: `pnpm --filter @tinker/web build`
Expected: PASS (build completes).

---

## Self-Review (done while writing)

- **Spec coverage:** Component §1 of the spec (Vite proxy, HTTP client speaking the API dialect, `ai-url-planning` request, consume artifacts by `kind`) is covered by Tasks 1–4. Long-job *UX* (progress/cancel) is intentionally deferred to Phase 1, where it has UI to attach to — noted so it isn't dropped. The Create Demo *request-shape* switch is also Phase 1 (it touches `CreateDemoScreen`); this phase delivers the client it will call.
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `CompositionGenerationClient`, `CreateCompositionJobRequest`, `WaitForJobOptions`, `selectArtifact(Url)`, `isTerminalStatus` are defined in Task 1 and used unchanged in Tasks 2–3. `renderer: "hyperframes"` default is enforced in the HTTP client (Task 2) and asserted in its test.

## Phase roadmap (subsequent plans)

Each gets its own plan when reached (per the per-subsystem rule):
- **Phase 1** — `packages/composition` preview adapter (iframe + `window.__timelines`) + `CompositionTimeline` + wire Create Demo to send `ai-url-planning` and land on the preview. Includes a spike on iframe `contentWindow` access.
- **Phase 2** — context chips + chat rework (`useCompositionEditFlow`) + `MockCompositionEditClient` → full loop on fake edits.
- **Phase 3** — real `POST /api/jobs/:id/edits` in `apps/api` composing `createOpencodeHyperframesRepairer` + `runHyperframesRender` + the `revisions` schema change (Person A review).
