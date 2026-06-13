# Tinker Studio — Porcelain Design Spec (implementation source of truth)

This is the distilled, implementation-facing spec for the **Porcelain** theme (the only
theme we ship). It exists because the pixel-accurate editor mock (`design/porcelainnew.html`)
is a 3.9 MB rendered DOM dump that is not readable as source. Use this doc + the references
below as the exact spec. **Copy the design exactly. Do not invent new UI.**

## Reference files

- `docs/design-spec.md` — this file (tokens + editor structure/copy).
- `DESIGN.md` — full design-system rationale (colors, type, spacing, shadows, do/don't).
- `UI.md` — editor layout + interaction model + AI edit UX.
- `design/createdemo.jsx` — **Create Demo** screen, readable React source (copy this exactly).
- `design/HTML text.html` — the `.tk-*` component CSS chrome (buttons, tabs, chips, timecode,
  play, rail, rowcard, settings menu). Port these rules into the app.
- `.design-ref/createdemo-empty.png` — Create Demo empty-state screenshot.
- `.design-ref/editor-reference.png` — Editor screenshot (the target).
- `apps/web/public/reference-designs/porcelain.html` — full Porcelain reference mock.

## Fonts

- UI: **Instrument Sans** (weights 400/500/600/700).
- Mono (timecodes, repo input, tick labels, technical metadata): **IBM Plex Mono** (400/500).
- Load via Google Fonts `<link>` in `apps/web/index.html`.

## Design tokens (Porcelain) — emit as CSS custom properties on the app root

```css
:root, .tk-porcelain {
  --tk-font: 'Instrument Sans', system-ui, -apple-system, sans-serif;
  --tk-mono: 'IBM Plex Mono', ui-monospace, monospace;

  /* surfaces */
  --tk-app-bg: #FBFAF6;        /* warm page / editor shell background */
  --tk-card: #FFFFFF;          /* panels, cards, clean content */
  --tk-raised: #F3F1EA;        /* toolbar controls, timeline rails, panel headers, chip bg */
  --tk-subtle: #E8E4DA;        /* disabled/secondary control surfaces */
  --tk-preview-bg: #10192C;    /* deep blue preview stage behind captured product UI */

  /* text */
  --tk-text: #1B1A17;          /* primary ink */
  --tk-text-sec: #6E6C66;      /* secondary / metadata */
  --tk-text-ter: #9D9B94;      /* tertiary / quiet labels, ghost hints */

  /* accent (ink blue) */
  --tk-accent: #3B5BD9;        /* actions, playhead, selection, active tool */
  --tk-accent-text: #FFFFFF;
  --tk-accent-soft: rgba(59,91,217,0.10);   /* selected-range fill, hover */
  --tk-accent-line: rgba(59,91,217,0.32);   /* selected-range / focus border */

  /* lines & control surfaces */
  --tk-border: rgba(20,20,15,0.12);
  --tk-border-strong: rgba(20,20,15,0.20);
  --tk-border-soft: rgba(20,20,15,0.07);
  --tk-btn-bg: #F3F1EA;
  --tk-btn-border: rgba(20,20,15,0.12);
  --tk-hover: rgba(20,20,15,0.05);
  --tk-ok: #2E8B57;            /* success (verified repo check) */

  /* radius */
  --tk-radius-xs: 3px; --tk-radius-sm: 6px; --tk-radius-md: 8px;
  --tk-radius-lg: 11px; --tk-radius-xl: 14px; --tk-radius-pill: 999px;

  /* shadows */
  --tk-shadow-sm: 0 1px 2px rgba(20,20,15,0.06);
  --tk-shadow-md: 0 10px 28px rgba(20,20,15,0.09);
  --tk-shadow-overlay: 0 18px 54px rgba(25,32,46,0.16);
}
```

Spacing grid: 4 / 6 / 8 / 12 / 16 / 24 px. Dense editor controls use 6–8px gaps; larger
containers use 12–16px padding.

## `.tk-*` component classes

Port the full CSS from `design/HTML text.html` (the `<style>` block, lines ~17–273). Key classes:

- `.tk-btn` / `.tk-btn-accent` — secondary (raised) and primary (ink-blue) buttons. 11.5px/600.
- `.tk-iconbtn` — 28×28 ghost icon button; hover = `--tk-hover`.
- `.tk-play` — 32×32 round accent play button.
- `.tk-timecode` — mono 11.5px timecode (min-width 96px).
- `.tk-vr` — 1px×20px vertical divider in `--tk-border`.
- `.tk-chip` — pill, muted border; hover → accent-soft.
- `.tk-tab` — segmented panel tab; active = `.tk-tab-on` (white card + border + small shadow).
- `.tk-railbtn` — tool-rail button (icon-only); active = `.tk-railbtn-on` (accent).
- `.tk-rowcard` — bordered selectable row (zoom-move card); hover = `--tk-hover`.
- `.tk-send` — 26×26 round accent send button.
- `.tk-dot` (typing pulse), `.tk-spin` (verify spinner), `.tk-caret` (typewriter), `.tk-shake`
  (invalid input), `.tk-scan` (scene-detect sweep).

## Layout law (do not break)

Editor is two columns: **left ≈70%** (preview + playback + timeline), **right ≈30%** full-height
AI/edit panel. The right panel runs top→bottom alongside the timeline. Composer/prompt input is
pinned to the bottom of the panel, Cursor-style. Do NOT add a separate object-inspector panel.

---

## SCREEN 1 — Create Demo ("New demo" start screen)

**Source: `design/createdemo.jsx` — copy exactly.** Screenshot: `.design-ref/createdemo-empty.png`.

- Centered single column, `max-width: 580px`, vertically centered when empty.
- **Empty hero:** `h1` "**Tinker** Studio" (Tinker 700 ink, " Studio" 400 `--tk-text-sec`),
  26px, letter-spacing −0.025em. Subtitle 13.5px `--tk-text-sec`: "Paste your repo, get the demo video."
- **Composer island** (white card, `--tk-border`, radius `--tk-radius-lg`, `--tk-shadow-md`):
  - **Repo row** (header bg `--tk-raised`, bottom border): GitHub mark (fills `--tk-accent` once
    verified), mono input with ghost `github.com/owner/repo`. While verifying → `.tk-spin`;
    verified → green `--tk-ok` check. Repo must verify before a message can send (shake if empty).
  - **Story row:** 2-row textarea; when empty+blurred, a typewriter ghost cycles example prompts
    with a blinking caret. Circular accent send button (disabled until repo verified + text present).
- **After first send:** thread view. User message = right-aligned `--tk-accent-soft` bubble with
  `--tk-accent-line` border. AI message = text + a **storyboard card** (scene rows: mono timecode +
  scene name, divided by `--tk-border-soft`) with a footer link "**Record & open in editor →**" that
  navigates into the Editor. Typing state = 3 pulsing `.tk-dot`s.

> Data note: the visual composer collects **repo URL + a free-text story prompt**. Map these to the
> `CreateDemoRequest` contract; supply sensible defaults (duration, aspect ratio, product URL) for
> fields the minimal composer doesn't surface, or keep them as advanced/optional. The product URL,
> duration cap, and aspect ratio still validate through `CreateDemoRequestSchema`.

---

## SCREEN 2 — Editor (Tinker Studio)

Screenshot: `.design-ref/editor-reference.png`. Exact structure & copy below.

### Top app bar (light, ~52px, bottom border `--tk-border`)
`[Tinker Studio]` brand · `tk-vr` · `driftboard-demo.tinker` slug + `Saved` status (right of slug) ···
spacer ··· `Settings` icon button (`.tk-iconbtn`) · `tk-vr` · **Preview** (`.tk-btn`) ·
**Export** (`.tk-btn.tk-btn-accent`).

### Left column ≈70%
1. **Preview stage** — deep-blue (`--tk-preview-bg`) rounded canvas; captured product UI sits on a
   warm gradient artifact with soft shadow; the live cursor renders over it.
2. **Floating tool rail** — vertical, left edge of preview, card with `--tk-shadow-md`. Buttons
   (`.tk-railbtn`, icon-only, aria-labels): Close tools, Split clip, Zoom move, Auto frame, Crop,
   Mask. Active tool = `.tk-railbtn-on` (accent).
3. **Playback bar** — `[Previous clip]` `.tk-iconbtn`, **Play** `.tk-play`, `[Next clip]`; then
   `.tk-timecode` "`0:03.2 / 0:24.0`"; `tk-vr`; `[Undo] [Redo] [Delete selection]` `.tk-iconbtn`
   (disabled state visibly dimmed); right-aligned mono "`1080p · 60fps`".
4. **Timeline**:
   - Ruler: mono ticks `0:00 · 0:04 · 0:08 · 0:12 · 0:16 · 0:20 · 0:24`.
   - **Clip track**: warm raised bars (radius `--tk-radius-sm`) with name + duration:
     "Open dashboard 6.0s", "Invite teammates 7.0s", "Workspace settings 5.5s", "Share & wrap-up 5.5s".
   - **Event lane** (above/overlapping clips): thin accent-translucent **zoom bars** with label +
     factor — "Invite modal ×1.6", "Share button ×1.5"; plus small **click** markers on the track.
   - **Playhead**: 1px accent vertical line with a handle; selection range uses `--tk-accent-soft`
     fill + `--tk-accent-line` border.

### Right column ≈30% — full-height panel (top border-left `--tk-border`)
- **Tabs** (`.tk-tab`, active `.tk-tab-on`): **Chat · Zoom · Speed · Cursor · Frame**.
- **Zoom tab** (shown in mock):
  - Section "Auto zoom": row "Zoom on clicks" / sub "Push in when the cursor clicks" + toggle (on);
    "Intensity" slider with mono value "×1.6".
  - Section "Zoom moves · 2": `.tk-rowcard` list — "Invite modal  0:08.0 → 0:12.4  ×1.6",
    "Share button  0:19.6 → 0:22.6  ×1.5". Footer hint (`--tk-text-ter`, 11px): "Select a move to
    jump there. Delete removes it from the timeline."
- **Chat tab** = full-height AI assistant: scrollable history of user prompts + AI edit cards
  (apply/undo/keep), attachment chips, composer pinned to the bottom with a round `.tk-send` button.
- Cursor / Speed / Frame tabs expose their respective controls (cursor/click display, clip speed,
  frame/wallpaper). Keep within MVP scope (no captions/callouts/audio/voiceover).

### Scope guardrails
- No captions, callouts, text overlays, voiceover, or audio timeline anywhere in the UI.
- Not a general video editor — only trim, zoom (auto/manual), speed, cursor/click, save, export.
