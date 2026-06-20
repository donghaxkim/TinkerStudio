# Smooth Playwright capture (first pass)

> Legacy note: this describes the removed Playwright capture polish path. New AI URL published videos are produced by Testreel under `generated/<run>/testreel/`.

Makes Tinker's Playwright demo path feel more Screen Studio-like by baking cinematic
motion into the capture and emitting a metadata layer for a future post-render camera pass.

> This document covers the **capture layer**. For the end-to-end multi-phase pipeline
> (Product Understanding → Demo Strategy → Browser Capture) and the full generated
> artifact layout, see [demo-pipeline.md](./demo-pipeline.md).

## What changed

Capture now runs in `smooth` mode (`runPlaywrightCapture(plan, { smooth: true })`),
which renders motion **into the page during recording** so Playwright's video
recorder captures it directly (no dependency on OS/native cursor capture):

- **Synthetic cursor** — native cursor hidden via CSS; a fake cursor element moves
  along a minimum-jerk profile (`s = 10u³ − 15u⁴ + 6u⁵`) with a distance-aware
  duration `clamp(180 + 110·log2(d/w + 1), 250, 1200)`.
- **Click polish** — an expanding ripple + cursor press-bounce at each click point.
- **Smooth scroll** — abrupt wheel jumps replaced with `requestAnimationFrame`
  eased scrolling (`easeInOutCubic`).

## Generated artifacts

For a Playwright run, `generated/<run>/playwright/` now also contains:

| File | Description |
| --- | --- |
| `storyboard.json` | existing — planner storyboard |
| `capture-plan.json` | existing — click/scroll/type plan |
| `action-trace.json` | **new** — per-action trace: id, type, selector, start/end time, target box, click point, scroll position, before/after screenshots, success/error |
| `render-plan.json` | **new** — fps, resolution, cursor settings, zoom/click/scroll segments, holds |
| `capture/videos/main.webm` | the raw recording (already smoothed) |
| `final.mp4` | **new** — exported video |

## final.mp4 — honest first-pass scope

`final.mp4` is a real **ffmpeg transcode** (webm → H.264) of the recording — *not*
a faked rename. The smoothness comes from the synthetic cursor / ripple / eased
scroll baked into the recording. **True post-render camera zoom & holds described
in `render-plan.json` are deferred** to a later pass (see TODOs in
`packages/browser-capture/src/finalVideo.ts` and `runAiUrlDemo.ts`). If ffmpeg is
unavailable the transcode is skipped without failing the run.

## Modules (`packages/browser-capture/src/`)

- `cursorPath.ts` — pure easing/duration/Bézier math (unit-tested)
- `actionTrace.ts` — trace types + recorder + `deriveActionTraceFromCapture`
- `renderPlan.ts` — `buildRenderPlan` + heuristics (`zoomScaleForTarget`, `clusterActions`)
- `smoothScroll.ts` — eased-scroll helpers + Playwright driver
- `syntheticCursor.ts` — injected in-page cursor/ripple/scroll engine + Playwright helpers
- `finalVideo.ts` — `transcodeToMp4`

### Tuning the cinematics

The "feel" lives in two small, documented heuristics in `renderPlan.ts`:
`zoomScaleForTarget` (how hard to zoom by target size, 1.2–1.5) and
`clusterActions` (when nearby clicks share one zoom instead of pumping per click).

## Smoke test

```
pnpm --filter @tinker/browser-capture smoke:smooth
```

Runs a real headless capture against a local fixture, writes the three new
artifacts to `generated/smoke-smooth-playwright/`, transcodes `final.mp4`, and
probes it for a valid duration.
