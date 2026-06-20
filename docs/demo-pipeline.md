# Demo generation pipeline (multi-phase)

Tinker turns three inputs — a **product URL**, a **GitHub repo**, and an optional
**prompt** — into a smooth product demo video. To the user it feels like one agent; inside
it is a small chain of lightweight phases joined by **explicit JSON artifact contracts**.
No phase is an autonomous system: each is a function (deterministic by default, pluggable
to LLM) over the previous phase's artifact.

```text
POST /api/jobs
  -> runLocalGenerationJob
  -> runAiUrlDemo
     -> analysis
     -> understanding
     -> strategy + storyboard
     -> planner emits TestreelGenerationPlan
     -> Testreel CLI records and exports MP4
     -> testreel/final.mp4 + run-summary.json
```

Tinker generates repo-grounded product demos through one pipeline: analysis, understanding,
strategy, Testreel planning, Testreel recording/export, and `testreel/final.mp4`.

The pipeline lives in `packages/demo-assembly` (`runAiUrlDemo`). The Understanding and
Strategy phases feed the Testreel planner, and the published MP4 comes from the Testreel CLI.

## Generated artifact layout

```text
generated/<run>/
  input.json                     # resolved request (provenance)

  product-analysis.json          # website analysis (existing)
  repo-analysis.json             # repo analysis (existing)
  product-understanding.json     # Product Understanding phase
  demo-strategy.json             # Demo Strategy phase
  storyboard.json                # strategic storyboard (beats carry lineage)

  testreel/
    recording-plan.json          # native Testreel generation plan
    recording.json               # Testreel recording result
    final.mp4                    # published video output
    output/                      # Testreel export manifest and assets

  run-summary.json               # status + artifacts + per-beat coverage + warnings
```

## Phase contracts

### Product Understanding — `product-understanding.json`
`deriveProductUnderstanding(productAnalysis, repoAnalysis, prompt)` →
evidence-backed answer to *what is this product, who is it for, what's demoable*.
Every claim cites a source (`repo` / `website` / `prompt`); anything not grounded is an
`unknown` rather than invented. Capabilities come from repo features; demoable flows from
repo demo ideas corroborated by visible UI affordances (which sets per-flow confidence).
Override via `runAiUrlDemo({ understandProduct })`.

### Demo Strategy + Story — `demo-strategy.json` + `storyboard.json`
`deriveDemoStrategy(understanding, prompt, duration, aspect)` auto-selects the single
strongest flow and commits to a story. **Flow selection** (`selectFlow`) is intentionally
small and tunable:

```text
score = confidenceWeight(high=3 / medium=2 / low=1)
      + 2  if the prompt mentions the flow      // honour the user's ask
      + 0.5 * min(evidenceCount, 3)             // prefer better-grounded flows
```

It emits the angle, target audience, primary proof, an ordered `messageHierarchy`, success
criteria and risks, plus a 4-beat storyboard (Hook → Demo → Proof → CTA) whose beats carry
`strategyMessageId` and `proofPointId` lineage. Override via `runAiUrlDemo({ strategize })`.
This is the seam a future chat UX will use to let the user tweak the suggested story — the
artifact contract does not change.

### Published Video — Testreel artifacts
The strategy + storyboard are passed to the planner so the Testreel recording plan realizes
the *selected flow* rather than a generic homepage tour. Testreel records and exports the
published MP4 under `testreel/final.mp4`.

## Running it

```bash
pnpm --filter @tinker/demo-assembly generate:ai-url-job -- --repo https://github.com/owner/repo --url https://product.example.com --duration 45
```

It prints the run folder and every artifact path (product-understanding, demo-strategy,
storyboard, recording-plan, recording, final.mp4, run-summary) plus warnings.

```bash
# Deterministic, offline end-to-end smoke (real smooth capture against a local fixture):
pnpm --filter @tinker/demo-assembly smoke:pipeline
```

If Chromium isn't found, prefix with
`PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright`.

## Local agent backend (opencode vs Claude Code)

The Testreel **recording planner** is the only step that needs an LLM (website analysis is
Chromium; repo analysis is a deterministic README/package.json scan; understanding +
strategy are deterministic). It defaults to **opencode**. To run the whole pipeline with the
locally-installed **Claude Code CLI** instead — no opencode required — set:

```bash
TINKER_AGENT_BACKEND=claude-code   # required to use the Claude Code planner
# optional: TINKER_CLAUDE_CODE_MODEL=claude-opus-4-8, TINKER_CLAUDE_CODE_TIMEOUT_MS=300000
```

The Claude planner runs `claude -p --allowedTools ""` (no tools — it plans from the prompt
context, which already embeds the website + repo analysis). Validate it offline with:

```bash
pnpm --filter @tinker/demo-assembly smoke:pipeline:claude   # real `claude -p` -> final.mp4
```

**Running it from the web UI with Claude Code:** start the API with the env var
(`TINKER_AGENT_BACKEND=claude-code pnpm --filter @tinker/api dev`) + the web dev server, then
in the create-demo screen set **Planning agent → Claude**. Generation always uses the
Testreel published-video pipeline.

## Known limitations (first pass)

- **No interactive back-and-forth yet.** The story is auto-selected; the `understandProduct`
  / `strategize` seams (and the chat-ready strategy artifact) are where that lands next.
- **Understanding/strategy are deterministic.** They map structured analysis into the
  contract — accurate and non-generic, but not yet LLM-deepened. The seams accept an LLM
  implementation without touching the artifact shapes.
- **Beat lineage is planner-level.** `run-summary` coverage is based on storyboard and
  published-video presence, not per-beat pixel verification.
