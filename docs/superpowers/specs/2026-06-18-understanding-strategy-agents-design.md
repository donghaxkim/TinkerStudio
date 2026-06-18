# Design: Real agentic Understanding + Strategy (repo + URL only)

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Branch context:** `feat/local-llm-backend`
**Related:** `docs/demo-pipeline.md`, memory `tinker-demo-pipeline`, `tinker-demo-quality-research`

## Goal

Make the first two pipeline phases — **Product Understanding** and **Demo Strategy/Story** —
into real, model-driven work so the generated demo communicates *what the product is, who it's
for, how it helps, and what each moment proves*. Today both phases are deterministic heuristic
functions; the resulting videos read as "clicking around" because the pipeline never derives a
viewer-level story. This is the highest-impact change from the demo-quality research.

The user gives **only a GitHub repo link + a website URL** — no prompt. The agents must derive
the entire story from understanding the product.

## Scope

**In scope (one coherent "repo + URL only" build):**
- Understanding becomes a **real agent loop** (Approach A): `claude -p` with read-only repo
  tools + the DeepWiki MCP, model-driven, emitting an expanded `product-understanding.json`.
- Strategy becomes a **single strong LLM call** (optional self-critique pass, off by default)
  consuming the expanded understanding, emitting `demo-strategy.json` + `storyboard.json`.
- **Expanded `product-understanding.json` schema** (problem → solution → viewer payoff → proof).
- **Promptless**: `prompt` becomes optional context everywhere; the Create Demo UI drops the
  prompt field (input = repo + URL only).
- Deterministic fallbacks for both phases, updated to emit the expanded shape.
- Tests across `@tinker/demo-assembly` and `apps/web`, plus one gated live smoke.

**Out of scope (explicit non-goals):**
- The storyboard **approve / refine back-and-forth loop** with the user. The architecture
  supports adding it later (storyboard is a standalone artifact behind the Strategy seam); for
  now Strategy's proposed storyboard is **auto-accepted** and the predetermined video generates.
- The **recording agent** (agentic, on top of Playwright) — its own later spike. Principle:
  *agentic resolution, deterministic on-camera take.*
- Captions / voiceover / callouts legibility layer (dropped earlier — legibility comes from
  directing, not overlays).
- Output caching for reproducibility (YAGNI; noted as future).
- Differentiators/hook schema fields (YAGNI).

## Requirements & constraints

- **Playwright remains the capture substrate** (hard constraint); other tools layer on top.
- **Three phases stay one agent to the user** — all changes sit behind the existing
  `understandProduct` / `strategize` seams + JSON artifact contracts; one orchestrator
  (`runAiUrlDemo`), one progress surface. No new user-visible agent or stage.
- **Loop in the brain, not the camera** — real agency in Understanding/Strategy reasoning;
  the recording take and render stay deterministic.
- **A run never hard-fails** on Understanding or Strategy — deterministic fallback behind each
  seam, with a visible `warning`.
- Gated behind `TINKER_AGENT_BACKEND=claude-code` (same switch that routes the planner to the
  local `claude` CLI). Otherwise the deterministic path runs unchanged.

## Architecture & data flow

The seams already exist: `runAiUrlDemo` calls `understandProduct(input)` and `strategize(input)`
and defaults each to the deterministic function. This build swaps the defaults (when the agent
backend is enabled) — no pipeline restructure.

```
input = { productUrl, repoUrl, websiteAnalysis, repoAnalysis?, repoCheckoutDirectory? }   // no user prompt
runAiUrlDemo:
  Phase 1  understandProduct(input)
    └─ agent enabled?  → createClaudeUnderstandingAgent (real agent loop, Approach A)
       1. write temp MCP config (DeepWiki)
       2. claude -p  (cwd = repo checkout; tools = Read/Grep/Glob + deepwiki MCP; NO Bash/Write/WebFetch)
          model investigates repo + asks DeepWiki + reads websiteAnalysis, in its own loop
       3. final JSON → parse + zod-validate + usability gate → (1 retry) → expanded product-understanding.json
       └─ any failure / no repoUrl  → deriveProductUnderstanding (deterministic, expanded shape) + warning
    └─ agent disabled → deriveProductUnderstanding
  Phase 2  strategize({ understanding, durationCapSeconds, aspectRatio })   // prompt optional
    └─ agent enabled?  → createClaudeStrategyAgent (one claude -p, no tools; optional self-critique)
       → demo-strategy.json + storyboard.json  (parse + validate)
       └─ failure → deriveDemoStrategy (deterministic) + warning
  Phase 3  Browser Capture … (unchanged; recording-agent deferred)
```

DeepWiki is a **booster, not a hard dependency**: if the repo isn't public/indexed or DeepWiki is
unreachable, the agent proceeds on repo-file reading + website analysis and notes it; only a total
agent failure triggers the deterministic fallback.

## Expanded `product-understanding.json` schema

Spine: **problem → who → how it solves (mechanism) → why useful → viewer takeaway → proof flows.**
Evidence is centralized: a single `evidence[]` pool with `id`s; everything references by
`evidenceRefs` (no inline duplication).

```jsonc
{
  "version": 1,
  "product": { "name": "", "category": "", "oneLine": "",
               "targetUsers": [], "primaryProblem": "", "primaryValueProposition": "" },

  "valueNarrative": {
    "problem": "",          // the real problem the product solves
    "audience": "",         // who feels this problem / who it's for
    "howItSolves": "",      // concrete solution mechanism (agent prompt demands specifics)
    "whyItMatters": "",     // overall product payoff
    "viewerTakeaway": "",   // what the viewer should understand, full stop
    "evidenceRefs": ["evidence-1"]
  },

  "capabilities": [
    { "id": "capability-1", "name": "", "description": "", "evidenceRefs": [] }
  ],

  "demoableFlows": [
    { "id": "flow-1", "rank": 1, "rankReason": "",
      "name": "", "whyItMatters": "",
      "requiredInputs": [], "expectedOutcome": "",
      "proves": "",            // what this flow proves
      "viewerTakeaway": "",    // what the viewer understands after this moment
      "confidence": "high", "evidenceRefs": [] }
  ],

  "evidence": [
    { "id": "evidence-1", "sourceType": "repo|website|docs",
      "source": "", "quoteOrReference": "", "claim": "" }
  ],

  "constraints": [], "unknowns": [], "confidence": "high", "warnings": []
}
```

Notes:
- `howItSolves` keeps the readable name; the agent prompt enforces a concrete mechanism
  (e.g. "code-defined plans, CLI init, Stripe sync, billing UI") rather than vague prose.
- `demoableFlows` array order = demo-value rank by default; `rank`/`rankReason` make it explicit
  and auditable so a weak flow isn't silently chosen.
- `evidenceRefs` everywhere → `evidence[]` is the single auditable pool. Adding `id` to evidence
  is a required schema change (today it has none and is duplicated inline).
- The deterministic fallback must emit this same shape (best-effort `valueNarrative`, ranked
  flows, evidence pool with ids) or a fallback run fails validation.

## Components & interfaces

All in `packages/demo-assembly/src/` unless noted. Each unit is isolated and injectable.

- **MODIFIED `claudeCodeAgent.ts`** — generalize to
  `runClaudeAgent(prompt, { cwd, allowedTools?, mcpConfigPath?, model?, timeoutMs? })`.
  Planner keeps `allowedTools: ""` (single-shot, unchanged). Understanding agent uses
  `Read/Grep/Glob` + DeepWiki MCP via `--mcp-config`. Backward compatible.
- **NEW `understandingAgent.ts`** — `createClaudeUnderstandingAgent({ runAgent, fallback }): UnderstandProduct`.
  Writes temp MCP config `{ mcpServers: { deepwiki: { type: "http", url: "https://mcp.deepwiki.com/mcp" } } }`;
  builds the promptless investigation prompt; runs the agent in the checkout cwd; parses +
  validates (1 retry); falls back to deterministic. Returns `{ understanding, transcript? }` so
  the orchestrator can persist a debug log; a thin adapter satisfies the `UnderstandProduct` seam.
- **NEW `demoStrategyAgent.ts`** — `createClaudeStrategyAgent({ runSynthesis, fallback }): Strategize`.
  One `claude -p` (no tools) consuming the expanded understanding → `DemoStrategy` + `Storyboard`;
  optional generate→self-critique→revise (flagged off); fallback to `deriveDemoStrategy`.
- **MODIFIED `productUnderstanding.ts`** — expanded schema (above) + `deriveProductUnderstanding`
  updated to emit it. Also extend `DeriveProductUnderstandingInput` with optional
  `repoCheckoutDirectory?` (today it has `productUrl`, `repoUrl?`, `prompt`, `websiteAnalysis`,
  `repoAnalysis?` only) so the agent can run in the cloned-repo cwd and read files. `runAiUrlDemo`
  already has `repoCheckoutDirectory` available at the point `understandProduct` is called.
- **MODIFIED `demoStrategy.ts`** — deterministic `deriveDemoStrategy` consumes/produces the
  expanded-aware shape (uses `valueNarrative`, ranked flows, `viewerTakeaway`).
- **MODIFIED `runAiUrlDemo.ts`** — when `TINKER_AGENT_BACKEND=claude-code`, default
  `understandProduct` = Understanding agent and `strategize` = Strategy agent (both with
  deterministic fallback); `prompt` optional throughout; write optional `understanding-agent.log`.
- **MODIFIED web `CompositionDemoScreen.tsx`** — remove the prompt field + `promptDraft`; input =
  repo + URL only (request contract already defaults prompt server-side).

**No new dependency**: `claude -p` is the MCP client and agent loop (`--mcp-config`), so there is
no `@modelcontextprotocol/sdk` dep and no hand-written DeepWiki client.

**Grounding/evidence artifact:** the model drives DeepWiki internally, so there is no structured
`deepwiki-grounding.json`; the audit trail is the output's cited `evidence[]` pool, plus an
optional raw `understanding-agent.log` (the claude transcript) for debugging.

## Error handling, fallback & safety

A run never hard-fails on Understanding/Strategy. Every fallback emits a `warning` into the
artifact + `run-summary.json` so it is visible the agent did not run.

| Failure | Behavior |
| --- | --- |
| `claude` CLI missing / agent errors / times out | → `deriveProductUnderstanding` (deterministic, expanded) |
| Output non-JSON / schema-invalid / unusable\* | 1 retry ("return ONLY valid JSON to this schema") → then deterministic fallback |
| No `repoUrl` | → deterministic fallback |
| Strategy agent fails | → `deriveDemoStrategy` (deterministic) |

\* Usability gate: ≥1 `demoableFlow` and non-empty `valueNarrative.problem` + `viewerTakeaway`.
Prevents over-strict validation from causing needless fallbacks.

DeepWiki is a booster, not required (degrades to repo + website grounding, noted in `warnings`).

**Safety:**
- Understanding agent runs with a **read-only allowedTools whitelist** — `Read/Grep/Glob` + the
  DeepWiki MCP tools only; **no Bash/Write/WebFetch** (mirrors the opencode planner's deny-list).
  The agent reads the cloned repo and asks DeepWiki; it cannot execute anything on the machine.
- **Data egress:** using DeepWiki sends the repo's `owner/repo` identity to Cognition's service
  (public repos only). Accepted trade-off.

**Nondeterminism:** agent output varies run to run; bounded by schema validation + the usability
gate + deterministic fallback. No output caching in this build (YAGNI; future).

## Testing

Isolate nondeterminism: test deterministic parts exhaustively and offline; test agent
orchestration with injected stubs; run the live model only in one gated smoke asserting
invariants, not exact text.

**Offline / CI (no `claude`, no network):**
1. Schema/contract — expanded `ProductUnderstandingSchema` validates; `evidenceRefs` resolve to
   real `evidence[]` ids; `rank` + `viewerTakeaway` present.
2. Deterministic fallbacks — `deriveProductUnderstanding` and `deriveDemoStrategy` emit the
   expanded shape; assert new fields + ref integrity.
3. Understanding agent with stubbed `runAgent` — valid JSON parsed; malformed → retry → fallback +
   warning; DeepWiki-unavailable → still produces output (no fallback).
4. Strategy agent with stubbed `runSynthesis` — valid parsed; invalid → fallback.
5. `runAiUrlDemo` — existing mocked-capture test stays green; `product-understanding.json` has the
   expanded shape; deterministic path runs when backend ≠ `claude-code`.
6. Web — `CompositionDemoScreen`: prompt field gone, input = repo + URL only, request omits prompt.

**Gated live smoke (manual, only place the real model runs):**
7. `smoke:understanding:claude` — real Understanding agent (claude + DeepWiki MCP) against
   `getpaykit/paykit` + fixture website analysis. Asserts invariants: schema-valid,
   `valueNarrative.problem`/`viewerTakeaway` non-empty, ≥1 ranked flow with `proves` +
   `viewerTakeaway`, all `evidenceRefs` resolve. Not in CI. Quality judged by eye.

## Phasing (for the implementation plan)

Highest-impact first; each phase independently shippable behind the seam:
1. **Expanded schema + deterministic fallbacks** (Understanding + Strategy emit new shape; tests).
   Foundation — everything else depends on the contract.
2. **Understanding agent** (Approach A: `claude -p` + repo tools + DeepWiki MCP; fallback; tests;
   live smoke). The single highest-impact change.
3. **Strategy agent** (one `claude -p`; consumes expanded understanding; fallback; tests).
4. **Promptless + UI** (prompt optional end-to-end; remove the Create Demo prompt field; tests).

## Open questions / future

- Storyboard **approve/refine** loop (user-facing) — future Strategy/UX; architecture ready.
- **Recording agent** spike — agentic resolution + deterministic take (separate, per research).
- Output **caching** by `(repoUrl + commit + productUrl)` for reproducibility — future.
- Does a fixed library of demo narrative framings beat per-product structure generation? (Research
  open question; revisit after Strategy agent lands.)
