# Remove Manual Fixture Generation Design

## Status

Approved for implementation.

## Context

`manual-fixture` was an early deterministic generation path. The current product path is `ai-url-planning` with Hyperframes output, and the API already rejects `mode: "manual-fixture"`. Keeping the old mode in the shared contract makes product-dead code look supported and keeps demo-assembly wired to a path the product no longer uses.

## Goal

Remove the `manual-fixture` create-demo mode from the shared generation contract and demo-assembly runtime so only `ai-url-planning` and the legacy assisted request shape remain valid contract inputs.

## Scope

- Delete `ManualFixtureCreateDemoRequestSchema` and `ManualFixtureCreateDemoRequest` from `@tinker/generation-contract`.
- Remove the `manual-fixture` arm from `CreateDemoRequestSchema`.
- Remove `runManualDemo`, `manualDemo`, the manual demo script, package exports, and root/package scripts for `generate:manual-demo`.
- Remove the manual branch and runner injection from `runLocalGenerationJob`; local jobs require `mode: "ai-url-planning"`.
- Update tests so `manual-fixture` is invalid contract input and remains only as a negative API/request example.
- Update current handoff/API docs that describe `manual-fixture` as supported or internal. Historical completed specs may remain as history unless they are active handoff docs.

## Non-Goals

- No changes to product UI behavior beyond type/test updates required by contract removal.
- No deletion of generic manual edit/editor functionality; this only removes the generation fixture mode.
- No replacement deterministic smoke path in this slice.

## Testing

- `pnpm --filter @tinker/generation-contract test`
- `pnpm --filter @tinker/demo-assembly test`
- `pnpm --filter @tinker/api test`
- Targeted web tests only if contract type changes affect existing web test compilation.
