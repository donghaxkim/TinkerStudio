# Person B Project Fixtures and Docs Cleanup Design

## Status

Approved for implementation planning.

## Context

`docs/dongha.md` tracks empty project/documentation gaps. `docs/prd.md` is currently missing or empty, and the storyboard/capture fixture files exist but have no content. These can be filled safely in parallel with UI work because they do not touch Create Demo implementation files.

## Goal

Fill the missing product and fixture documentation enough to support future implementation and tests:

- `docs/prd.md`
- `packages/project-schema/fixtures/storyboard.sample.json`
- `packages/project-schema/fixtures/capture-result.sample.json`

## Non-Goals

- No schema changes.
- No generated code.
- No Create Demo UI changes.
- Fixture files document plausible sample shapes, but schema/type definitions remain the canonical contracts.

## Required Behavior

- PRD should summarize MVP users, problem, workflow, non-goals, and acceptance criteria.
- Storyboard fixture should describe a plausible short Tinker demo with timed beats.
- Capture result fixture should mirror current browser-capture/demo-assembly concepts closely enough for humans and future tests without embedding local machine URLs or environment-specific run details.
- JSON files must be valid JSON.

## Implementation Plan

1. Create or fill `docs/prd.md`.
2. Fill `storyboard.sample.json`.
3. Fill `capture-result.sample.json`.
4. Validate JSON syntax.

## Verification

```bash
pnpm --filter @tinker/demo-assembly exec tsx src/fixtureSamples.test.ts
pnpm validate:schema
```
