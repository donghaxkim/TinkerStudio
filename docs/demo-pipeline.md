# Demo generation pipeline (multi-phase)

Tinker turns three inputs — a **product URL**, a **GitHub repo**, and an optional
**prompt** — into a smooth product demo video. To the user it feels like one agent; inside
it is a small chain of lightweight phases joined by **explicit JSON artifact contracts**.
No phase is an autonomous system: each is a function (deterministic by default, pluggable
to LLM) over the previous phase's artifact.

```text
product URL + repo URL + prompt
  → Analysis            (analyze the live site + the repo)
  → Product Understanding   → product-understanding.json
  → Demo Strategy / Story   → demo-strategy.json + storyboard.json
  → Playwright Capture Planning
  → Smooth Playwright Capture → playwright/demo-project.json + playwright/final.mp4
  → run-summary.json
```

Tinker generates repo-grounded product demos through one pipeline: analysis, understanding,
strategy, Playwright capture planning, smooth Playwright capture, `DemoProject`, and
`playwright/final.mp4`.

The pipeline lives in `packages/demo-assembly` (`runAiUrlDemo`). The browser-capture phase
reuses `@tinker/browser-capture` (smooth synthetic cursor / ripple / eased scroll — see
[smooth-playwright-capture.md](./smooth-playwright-capture.md)). The Understanding and
Strategy phases feed the single Playwright capture path.

## Generated artifact layout

```text
generated/<run>/
  input.json                     # resolved request (provenance)

  product-analysis.json          # website analysis (existing)
  repo-analysis.json             # repo analysis (existing)
  product-understanding.json     # Product Understanding phase
  demo-strategy.json             # Demo Strategy phase
  storyboard.json                # strategic storyboard (beats carry lineage)

  playwright/
    storyboard.json              # planner's capture storyboard (existing; see note)
    capture-plan.json            # deterministic Playwright actions (strict schema, as executed)
    capture-result.json          # capture output
    action-trace.json            # per-action trace + best-effort beat lineage
    capture-lineage.json         # capture-step -> storyboard-beat map (derived, non-mutating)
    render-plan.json             # zoom/hold/click segments
    director-plan.json           # Director Mode: shot list (hero/code/terminal/result/cta) + cursor + dead-time
    edit-decision-list.json      # Director Mode: timeline-compression cuts for >0.8s dead gaps
    final.mp4                    # smooth recording transcode (when ffmpeg present)
    capture/
      videos/ screenshots/
    demo-project.json            # editable DemoProject (existing)

  run-summary.json               # status + artifacts + per-beat coverage + warnings
```

> **Two storyboards, mapped clearly.** `storyboard.json` (run root) is the *strategic*
> story — the one source of truth for the narrative, with beats linked back to strategy
> messages and capabilities. `playwright/storyboard.json` is the planner's
> capture-oriented storyboard (kept for backward compatibility). `run-summary.json` lists
> both.

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

### Browser Capture — playwright artifacts
The strategy + storyboard are passed to the planner so the capture plan realizes the
*selected flow* rather than a generic homepage tour. Capture runs in smooth mode; the
action trace is stamped with best-effort storyboard-beat lineage (`beatId` / `intent`).

## Running it

```bash
pnpm --filter @tinker/demo-assembly generate:ai-url-job -- --repo https://github.com/owner/repo --url https://product.example.com --duration 45
```

It prints the run folder and every artifact path (product-understanding, demo-strategy,
storyboard, capture-plan, action-trace, render-plan, final.mp4, run-summary) plus warnings.

```bash
# Deterministic, offline end-to-end smoke (real smooth capture against a local fixture):
pnpm --filter @tinker/demo-assembly smoke:pipeline
```

If Chromium isn't found, prefix with
`PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright`.

## Local agent backend (opencode vs Claude Code)

The Playwright **capture planner** is the only step that needs an LLM (website analysis is
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
Playwright pipeline.

## Known limitations (first pass)

- **No interactive back-and-forth yet.** The story is auto-selected; the `understandProduct`
  / `strategize` seams (and the chat-ready strategy artifact) are where that lands next.
- **Understanding/strategy are deterministic.** They map structured analysis into the
  contract — accurate and non-generic, but not yet LLM-deepened. The seams accept an LLM
  implementation without touching the artifact shapes.
- **`final.mp4` is still an honest transcode** of the (already smooth) recording; true
  post-render camera zoom/holds from `render-plan.json` are deferred.
- **Beat lineage is derived, not planner-emitted.** `capture-lineage.json` and the
  `action-trace.json` `beatId`/`intent` stamps map steps to beats *proportionally* (the
  capture plan's strict schema can't carry per-step beat ids, so lineage is a separate
  artifact rather than inline). `run-summary` coverage is per-run, not per-beat-verified.
