# MVP-010 Final MVP Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the core Person B MVP is ready by mapping every MVP-010 acceptance item to current implementation evidence, running the required gates, rendering a sample MP4, and checking off the source-of-truth docs only after clean review.

**Architecture:** This is a signoff/audit ticket, not a feature ticket. The audit reads existing source-of-truth docs and tests, records evidence in `docs/reports/mvp-010-final-gate.md`, then marks MVP-010 done only after the required commands pass and a fresh reviewer finds no blockers.

**Tech Stack:** Markdown docs, pnpm workspace scripts, Vitest, TypeScript, Vite, ffmpeg/ffprobe through `@tinker/rendering`.

---

## Task 1: Create Final Gate Evidence Report

**Files:**

- Create: `docs/reports/mvp-010-final-gate.md`

- [x] **Step 1: Create the report shell**

Add sections for:

- required command results
- checklist evidence table
- residual risks
- reviewer result

- [x] **Step 2: Map each MVP-010 checklist item to evidence**

For each item in `docs/core-mvp-checklist.md`, cite the package test, source file, fixture, or command that proves it.

- [x] **Step 3: Record known residual non-core gaps**

Record that settings navigation, manual cursor/click controls, timeline polish, and schema review are post-core-MVP items tracked in `docs/dongha.md`.

---

## Task 2: Run Required MVP-010 Commands

**Files:**

- Modify: `docs/reports/mvp-010-final-gate.md`

- [x] **Step 1: Run schema validation**

```bash
pnpm validate:schema
```

- [x] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [x] **Step 3: Run tests**

```bash
pnpm -r test
```

- [x] **Step 4: Run web build**

```bash
pnpm --filter @tinker/web build
```

- [x] **Step 5: Render sample MP4**

```bash
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-core-mvp-smoke.mp4
```

- [x] **Step 6: Record command results in the report**

Record command, pass/fail status, and the rendered artifact path.

---

## Task 3: Final Review And Checkoff

**Files:**

- Modify: `docs/reports/mvp-010-final-gate.md`
- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`
- Modify: this plan

- [x] **Step 1: Request final MVP-010 review**

Ask a reviewer to inspect `docs/core-mvp-checklist.md`, `docs/dongha.md`, `docs/reports/mvp-010-final-gate.md`, and the current tests/source evidence for missed Person B core MVP requirements.

- [x] **Step 2: Fix review findings and re-review**

If Critical/Important findings exist, fix them, rerun focused verification, and request a fresh review.

- [x] **Step 3: Check off MVP-010**

Only after required commands pass and review is clean:

- mark MVP-010 `Status: Done`
- check every MVP-010 checklist item
- update `docs/dongha.md` current status and next steps
- check off this plan
