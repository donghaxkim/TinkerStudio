# MVP-007 Security Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden project loading, export output paths, export error display, and static security evidence for the Person B MVP surface.

**Architecture:** Keep the security policy boring and local-first: runtime schema validation stays in `@tinker/project-schema`; JSON load limits live in editor persistence; output root enforcement lives in `@tinker/rendering/node`; browser UI redacts local paths and relies on React text rendering; manual grep checks are documented as audit evidence.

**Tech Stack:** TypeScript, Zod, Vitest, React Testing Library, Node path/fs APIs, pnpm workspaces.

---

## File Map

- Modify: `packages/editor/src/project/projectPersistence.ts`
- Modify: `packages/editor/src/project/projectPersistence.test.ts`
- Modify: `apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectSaveLoadControls.test.tsx`
- Modify: `packages/rendering/src/node/renderFinalToMp4.ts`
- Modify: `packages/rendering/src/node/renderFinalToMp4.test.ts`
- Modify: `packages/rendering/src/node/exportJob.test.ts`
- Modify: `packages/rendering/src/cli/renderSampleProject.ts`
- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.test.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectLoadPanel.tsx`
- Create or modify: `apps/web/src/screens/Editor/ProjectLoadPanel.test.tsx`
- Create: `docs/security/mvp-007-security-audit.md`
- Modify after implementation: `docs/core-mvp-checklist.md`
- Modify after implementation: `docs/dongha.md`
- Modify after implementation: this plan

---

## Task 1: Harden Project JSON Loading

**Files:**

- Modify: `packages/editor/src/project/projectPersistence.ts`
- Modify: `packages/editor/src/project/projectPersistence.test.ts`
- Modify: `apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectSaveLoadControls.test.tsx`

- [x] **Step 1: Add failing editor persistence tests**

Add tests to `projectPersistence.test.ts`:

```ts
it("rejects DemoProject JSON above the safe size before parsing", () => {
  const oversized = " ".repeat(MAX_DEMO_PROJECT_JSON_BYTES + 1);

  const loaded = deserializeDemoProjectJson(oversized);

  expect(loaded.ok).toBe(false);
  if (loaded.ok) throw new Error("expected load failure");
  expect(loaded.error.message).toBe("Project JSON is too large");
});

it("rejects unknown schema versions", () => {
  const loaded = deserializeDemoProjectJson(JSON.stringify({ ...sampleProject, schemaVersion: "999.0.0" }));

  expect(loaded.ok).toBe(false);
  if (loaded.ok) throw new Error("expected load failure");
  expect(loaded.error.issues.join("\\n")).toContain("schemaVersion");
});
```

Import `MAX_DEMO_PROJECT_JSON_BYTES` from `projectPersistence.ts`.

- [x] **Step 2: Run red editor persistence tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/project/projectPersistence.test.ts
```

Expected: fail because `MAX_DEMO_PROJECT_JSON_BYTES` does not exist and oversized JSON is not rejected before parse.

- [x] **Step 3: Implement size limit in editor persistence**

In `projectPersistence.ts`, add:

```ts
export const MAX_DEMO_PROJECT_JSON_BYTES = 5 * 1024 * 1024;

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
```

At the top of `deserializeDemoProjectJson`:

```ts
if (getUtf8ByteLength(json) > MAX_DEMO_PROJECT_JSON_BYTES) {
  return {
    ok: false,
    error: {
      message: "Project JSON is too large",
      issues: [`DemoProject JSON must be ${MAX_DEMO_PROJECT_JSON_BYTES} bytes or less`],
    },
  };
}
```

- [x] **Step 4: Run green editor persistence tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/project/projectPersistence.test.ts
pnpm --filter @tinker/editor typecheck
```

Expected: editor persistence tests and typecheck pass.

- [x] **Step 5: Add failing web file-size test**

In `ProjectSaveLoadControls.test.tsx`, add a test that uploads a file larger than `MAX_DEMO_PROJECT_JSON_BYTES` and asserts it is rejected before load:

```ts
it("rejects oversized project files before reading them", async () => {
  render(<ProjectSaveLoadControls project={sampleProject} onProjectLoaded={onProjectLoaded} />);
  const file = new File(["x".repeat(MAX_DEMO_PROJECT_JSON_BYTES + 1)], "huge-project.json", {
    type: "application/json",
  });

  fireEvent.change(screen.getByLabelText("Load project JSON file"), { target: { files: [file] } });

  expect(await screen.findByRole("alert")).toHaveTextContent("Project JSON is too large");
  expect(onProjectLoaded).not.toHaveBeenCalled();
});
```

Import `MAX_DEMO_PROJECT_JSON_BYTES` from `@tinker/editor`.

- [x] **Step 6: Run red web file-size test**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectSaveLoadControls.test.tsx
```

Expected: fail because oversized files are read and parsed rather than rejected before reading.

- [x] **Step 7: Implement browser file-size guard**

In `ProjectSaveLoadControls.tsx`, import `MAX_DEMO_PROJECT_JSON_BYTES` and add:

```ts
function projectFileTooLargeError(): ProjectPersistenceError {
  return {
    message: "Project JSON is too large",
    issues: [`DemoProject JSON must be ${MAX_DEMO_PROJECT_JSON_BYTES} bytes or less`],
  };
}
```

Before `readFileAsText(file)`:

```ts
if (file.size > MAX_DEMO_PROJECT_JSON_BYTES) {
  setStatus({ kind: "error", error: projectFileTooLargeError() });
  return;
}
```

- [x] **Step 8: Run green web file-size tests**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectSaveLoadControls.test.tsx
pnpm --filter @tinker/web typecheck
```

Expected: web persistence tests and typecheck pass.

---

## Task 2: Restrict Export Output Paths

**Files:**

- Modify: `packages/rendering/src/node/renderFinalToMp4.ts`
- Modify: `packages/rendering/src/node/renderFinalToMp4.test.ts`
- Modify: `packages/rendering/src/node/exportJob.test.ts`
- Modify: `packages/rendering/src/cli/renderSampleProject.ts`

- [x] **Step 1: Add failing output policy tests**

Add tests to `renderFinalToMp4.test.ts`:

```ts
it("requires an explicit allowed output root", async () => {
  await withProjectRoot(async (projectRoot) => {
    await expect(
      renderFinalToMp4(shortProject(), {
        projectRoot,
        outputPath: join(projectRoot, "missing-policy.mp4"),
        runCommand: async () => {},
      }),
    ).rejects.toThrow(/allowed output root/);
  });
});

it("rejects output paths outside allowed roots before invoking ffmpeg", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  await withProjectRoot(async (projectRoot) => {
    await expect(
      renderFinalToMp4(shortProject(), {
        projectRoot,
        allowedOutputRoots: [join(projectRoot, "exports")],
        outputPath: join(projectRoot, "outside.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
      }),
    ).rejects.toThrow(/outside allowed export output roots/);
  });

  expect(calls).toEqual([]);
});

it("rejects traversal-style output paths before invoking ffmpeg", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  await withProjectRoot(async (projectRoot) => {
    await expect(
      renderFinalToMp4(shortProject(), {
        projectRoot,
        allowedOutputRoots: [join(projectRoot, "exports")],
        outputPath: join(projectRoot, "exports", "..", "escape.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
      }),
    ).rejects.toThrow(/outside allowed export output roots/);
  });

  expect(calls).toEqual([]);
});
```

- [x] **Step 2: Run red rendering tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: fail because output roots are not enforced.

- [x] **Step 3: Implement output root validation**

In `renderFinalToMp4.ts`, add `allowedOutputRoots: string[]` to `RenderFinalToMp4Options`.

Add helper:

```ts
function validateExportOutputPath(outputPath: string, allowedOutputRoots: string[]) {
  if (allowedOutputRoots.length === 0) {
    throw new Error("Export output requires at least one allowed output root");
  }

  const normalizedOutput = resolve(outputPath);
  const normalizedRoots = allowedOutputRoots.map((root) => resolve(root));
  const isAllowed = normalizedRoots.some((root) => isInsideRoot(normalizedOutput, root));

  if (!isAllowed) {
    throw new Error("Export output path resolves outside allowed export output roots");
  }
}
```

Use Node `relative`/`isAbsolute` for `isInsideRoot`. Call this after the `.mp4` extension check and before asset preflight or `mkdir`.

Update all `renderFinalToMp4` and `ExportJobCoordinator.start` tests/call sites with explicit `allowedOutputRoots`.

Update `renderSampleProject.ts` to pass:

```ts
allowedOutputRoots: [dirname(outputPath)]
```

- [x] **Step 4: Run green rendering/output tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts src/node/exportJob.test.ts
pnpm --filter @tinker/rendering typecheck
```

Expected: rendering tests and typecheck pass.

---

## Task 3: Redact User-Facing Export Errors And Prove Injection Safety

**Files:**

- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.test.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectLoadPanel.tsx`
- Create or modify: `apps/web/src/screens/Editor/ProjectLoadPanel.test.tsx`

- [x] **Step 1: Add failing export error redaction test**

In `ProjectExportPanel.test.tsx`, add:

```ts
it("redacts absolute local paths from user-facing export job failures", () => {
  render(
    <ProjectExportPanel
      project={sampleProject}
      exportJobState={{
        id: "job_failed_path",
        phase: "failed",
        progress: 0.1,
        error: {
          phase: "validating",
          message: "Asset resolved to '/Users/dongha/private/capture.mp4', but the file does not exist",
        },
      }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("[local path]");
  expect(screen.queryByText(/\\/Users\\/dongha\\/private/)).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run red export panel test**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectExportPanel.test.tsx
```

Expected: fail because absolute paths are displayed raw.

- [x] **Step 3: Implement local path redaction**

In `ProjectExportPanel.tsx`, add:

```ts
function redactLocalPaths(message: string) {
  return message
    .replace(/(?:^|[\\s'"])(\\/[A-Za-z0-9._~+\\- /]+)(?=$|[\\s'",.:;!?])/g, (match, path: string) =>
      match.replace(path, "[local path]"),
    )
    .replace(/[A-Za-z]:\\\\[^\\s'",.:;!?]+(?:\\\\[^\\s'",.:;!?]+)*/g, "[local path]");
}
```

Use `redactLocalPaths(state.error.message)` in the `role="alert"` text.

- [x] **Step 4: Add generated-project injection safety test**

Create `ProjectLoadPanel.test.tsx` if it does not exist:

```tsx
import { render, screen } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../../../packages/project-schema/fixtures/demo-project.sample.json";
import { ProjectLoadPanel } from "./ProjectLoadPanel.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("ProjectLoadPanel", () => {
  it("renders generated project strings as text instead of HTML", () => {
    render(
      <ProjectLoadPanel
        result={{
          ok: true,
          project: {
            ...sampleProject,
            title: "<img src=x onerror=alert(1)>",
          },
        }}
      />,
    );

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
```

- [x] **Step 5: Run green web security tests**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectExportPanel.test.tsx src/screens/Editor/ProjectLoadPanel.test.tsx
pnpm --filter @tinker/web typecheck
```

Expected: web security tests and typecheck pass.

---

## Task 4: Document Manual Security Audit Evidence

**Files:**

- Create: `docs/security/mvp-007-security-audit.md`

- [x] **Step 1: Run static audit commands**

Run:

```bash
rg -n "shell:\\s*true|exec\\(|execFile\\(|spawn\\(" apps packages
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|new Function|eval\\(" apps packages
```

Expected:

- no `shell: true`
- no `dangerouslySetInnerHTML`/raw HTML injection APIs in app code
- `spawn(` occurrences are argv-based ffmpeg/ffprobe/test helpers

- [x] **Step 2: Write audit doc**

Create `docs/security/mvp-007-security-audit.md` with:

```md
# MVP-007 Security Audit

## Automated Coverage

- Project JSON load size limit: covered by `packages/editor/src/project/projectPersistence.test.ts`.
- Browser file size rejection: covered by `apps/web/src/screens/Editor/ProjectSaveLoadControls.test.tsx`.
- Unknown schema version rejection: covered by `packages/editor/src/project/projectPersistence.test.ts`.
- Export output root policy: covered by `packages/rendering/src/node/renderFinalToMp4.test.ts`.
- Asset URI/path traversal: covered by `packages/rendering/src/node/assetResolution.test.ts`.
- Export job command/phase errors: covered by `packages/rendering/src/node/exportJob.test.ts`.
- User-facing path redaction: covered by `apps/web/src/screens/Editor/ProjectExportPanel.test.tsx`.
- React text injection safety: covered by `apps/web/src/screens/Editor/ProjectLoadPanel.test.tsx`.

## Static Checks

### Shell Execution

Command:

```bash
rg -n "shell:\\s*true|exec\\(|execFile\\(|spawn\\(" apps packages
```

Result:

- No `shell: true` usage found.
- `spawn` usage is restricted to ffmpeg/ffprobe execution and media test helpers with argv arrays.

### HTML/JS Injection

Command:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|new Function|eval\\(" apps packages
```

Result:

- No React raw HTML insertion or dynamic code evaluation APIs found in app/package source.

## Manual Notes

- Remote media assets remain non-exportable until a download/cache policy exists.
- Output roots protect obvious traversal/write-anywhere risks; OS-level symlink race hardening is future desktop packaging work.
- Error redaction is intentionally applied to browser-facing export messages; developer logs/state may still contain full paths until MVP-007+ logging policy is defined.
```

- [x] **Step 3: Run docs diff check**

Run:

```bash
git diff --check -- docs/security/mvp-007-security-audit.md
```

Expected: no whitespace errors.

---

## Task 5: Checklist, Review, And Full Verification

**Files:**

- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`
- Modify: this plan

- [x] **Step 1: Run focused verification**

Run:

```bash
pnpm --filter @tinker/editor test -- src/project/projectPersistence.test.ts
pnpm --filter @tinker/rendering test -- src/node/assetResolution.test.ts src/node/renderFinalToMp4.test.ts src/node/exportJob.test.ts
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectSaveLoadControls.test.tsx src/screens/Editor/ProjectExportPanel.test.tsx src/screens/Editor/ProjectLoadPanel.test.tsx
```

Expected: focused MVP-007 behavior passes.

- [x] **Step 2: Run static security checks**

Run:

```bash
rg -n "shell:\\s*true" apps packages
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|new Function|eval\\(" apps/web packages/editor packages/rendering packages/ai-edit-ui packages/generation-contract packages/project-schema
```

Expected: no `shell: true` matches and no raw HTML/dynamic eval matches in the Person B-owned app/editor/export/schema surface. Broader repo matches in `packages/product-analysis` are documented in `docs/security/mvp-007-security-audit.md`.

- [x] **Step 3: Run full gate**

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Expected: every command exits 0.

- [x] **Step 4: Request code/security review**

Spawn a review agent with MVP-007 design, this plan, source-of-truth checklist, and changed files. Require review of:

- project JSON size and schema validation
- output path root policy
- asset traversal/remote rejection remaining intact
- argv-only process execution
- user-facing path redaction
- generated project injection safety
- audit doc evidence

- [x] **Step 5: Fix review findings and re-review**

If Critical/Important issues are found, spawn a fixer agent with exact findings and scoped file ownership. After the fixer reports done, spawn a fresh reviewer. Repeat until no blockers remain.

- [x] **Step 6: Check off MVP-007**

Only after green verification and clean re-review:

- Mark MVP-007 `Status: Done` in `docs/core-mvp-checklist.md`.
- Check every MVP-007 checklist item and acceptance criterion.
- Update `docs/dongha.md` current status and next steps so MVP-008 edge-case fixtures are next.
- Check off this plan's Task 5 steps.
