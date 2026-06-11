---
version: alpha
name: Tinker Studio
description: "Agentic screen-recording editor. Porcelain is the current default: light editorial chrome around a clean product preview, compact timeline controls, and a full-height AI edit panel."
colors:
  primary: "#3B5BD9"
  secondary: "#6E6C66"
  tertiary: "#9D9B94"
  neutral: "#FFFFFF"
  background: "#FBFAF6"
  surface: "#FFFFFF"
  surfaceRaised: "#F3F1EA"
  surfaceSubtle: "#E8E4DA"
  text: "#1B1A17"
  previewBackground: "#10192C"
typography:
  h1:
    fontFamily: Instrument Sans
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h2:
    fontFamily: Instrument Sans
    fontSize: 18px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body-md:
    fontFamily: Instrument Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: Instrument Sans
    fontSize: 12px
    fontWeight: 450
    lineHeight: 1.45
  label:
    fontFamily: Instrument Sans
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1
  timecode:
    fontFamily: IBM Plex Mono
    fontSize: 11.5px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.01em"
  mono-caption:
    fontFamily: IBM Plex Mono
    fontSize: 10.5px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  xs: 3px
  sm: 6px
  md: 8px
  lg: 11px
  xl: 14px
  pill: 999px
spacing:
  xxs: 1px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
components:
  app-shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
  preview-stage:
    backgroundColor: "{colors.previewBackground}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.lg}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.md}"
    padding: 12px
  button-secondary:
    backgroundColor: "{colors.surfaceRaised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 12px
  button-ghost:
    backgroundColor: "{colors.surfaceSubtle}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 8px
  icon-button:
    backgroundColor: "{colors.surfaceRaised}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    size: 32px
  timeline-clip:
    backgroundColor: "{colors.surfaceRaised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: 44px
  ai-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  input-chat:
    backgroundColor: "{colors.surfaceRaised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 12px
  badge-muted:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: 8px
---

## Overview

Tinker Studio should feel like **Screen Studio for agents**: a focused, local-first editor for product-demo videos. The product UI should use the **Porcelain** direction as the default for now: light editorial chrome, crisp ink-blue actions, warm off-white workspace surfaces, and a calm full-height AI editing panel.

The reference mocks in `design/` and `apps/web/public/reference-designs/` also include Graphite and Nocturne directions. Treat those as optional theme variants, not the default product look:

- **Porcelain:** default editor theme; light, editorial, warm, precise, ink-blue accent.
- **Graphite:** dark pro-tool variant for future dark mode; indigo accent.
- **Nocturne:** blue-black studio variant; pink or tweakable accent.

The core layout is fixed: preview/editor canvas takes roughly 70% of the width; the AI panel takes roughly 30% and remains full height. Do not turn the product into a general video editor.

## Colors

Use Porcelain tokens for the app shell:

- **Background (`#FBFAF6`):** warm page and editor shell background.
- **Surface (`#FFFFFF`):** primary panels, sidebars, cards, and clean content areas.
- **Raised surface (`#F3F1EA`) and subtle surface (`#E8E4DA`):** toolbar controls, timeline rails, chip backgrounds, disabled/secondary controls.
- **Text (`#1B1A17`):** primary ink text.
- **Secondary (`#6E6C66`) and tertiary (`#9D9B94`):** metadata, disabled controls, secondary labels, and quiet badges.
- **Primary (`#3B5BD9`):** ink-blue actions, playhead, selected zoom ranges, active tools, and accepted edit actions.
- **Preview background (`#10192C`):** deep blue stage behind captured product UI when contrast is needed.

Borders should usually be warm translucent ink lines approximated by `rgba(20, 20, 15, 0.12)`; stronger dividers can use `rgba(20, 20, 15, 0.2)`. Avoid generic Tailwind grays and blues outside the token set.

## Typography

The default app face is **Instrument Sans**, matching the Porcelain reference direction. It should feel editorial but still compact enough for an editor surface.

Use **IBM Plex Mono** for timecodes, frame metadata, technical labels, and timeline tick labels. Keep mono text small and functional.

Type should be compact:

- 24px / 700 for major page titles when needed.
- 18px / 650 for panel section headings.
- 14px for normal UI copy.
- 12px and 11px for dense editor labels, metadata, pills, and tool labels.
- 10.5px to 11.5px for timeline/timestamp chrome.

Use slight negative letter spacing on large headings only. Do not over-style the interface with marketing typography; this is a production tool surface.

## Layout

The editor screen follows the mock structure:

1. **Top app bar:** compact brand lockup, project slug/status, preview/export actions.
2. **Main work area:** large preview/stage on the left, full-height AI edit panel on the right.
3. **Floating tool rail:** vertical, icon-first, left of preview. Active tool uses the primary ink-blue accent.
4. **Bottom timeline:** playback controls, timecode, scene detection, clip tracks, zoom/cursor event lanes.
5. **AI side panel:** tabs for Chat, Zoom, Cursor, and Frame; chat suggestions and prompt input anchored at the bottom.

Spacing follows a 4px grid with common values of 4, 6, 8, 12, 16, and 24px. Dense editor controls can use 6px/8px gaps. Larger containers should use 12px/16px padding. Keep the AI panel around 30% width; do not add a right-side object inspector in addition to the chat panel.

## Elevation & Depth

Depth is subtle and editorial:

- Use warm borders first.
- Use small soft shadows for cards/toolbars.
- Use larger shadows only for overlays, menus, floating tool rail, and the preview artifact itself.
- Preview content may sit on a deep blue stage, but app chrome should stay light and mostly flat.

Preferred shadow recipes:

- Small: `0 1px 2px rgba(20, 20, 15, 0.06)`
- Medium: `0 10px 28px rgba(20, 20, 15, 0.09)`
- Overlay: `0 18px 54px rgba(25, 32, 46, 0.16)`

## Shapes

Default radius is compact, not bubbly:

- 6px for small row cards and timeline clips.
- 8px for buttons, inputs, icon buttons, and tabs.
- 11px for panels and larger cards.
- Pill radius only for chips, playheads, badges, and circular controls.

Do not introduce random radius values. The mocks repeatedly use 6px, 7px/8px, 11px, and pill radii; normalize those to the token set above.

## Components

- **Primary buttons:** ink-blue background, white text, 8px radius, compact 12px padding. Use for Export, Play, Send, and accepted edit actions.
- **Secondary buttons:** warm raised surface, ink text, subtle border. Use for Preview, Detect scenes, and non-destructive toolbar actions.
- **Tool rail buttons:** 32px square/circle-ish hit area, icon-only, muted by default; active state is primary ink-blue with white icon.
- **Timeline clips:** warm raised bars with small labels and duration metadata. Selection uses primary border/fill.
- **Zoom/event lanes:** thin ink-blue translucent bars above the clip track. Keep handles minimal.
- **AI panel tabs:** compact segmented buttons. Active tab uses white surface and ink text; inactive tabs stay muted.
- **Chat suggestions:** pill chips with warm muted borders; hover shifts toward primary-soft styling.
- **Chat input:** bottom-anchored rounded input on raised warm surface with a circular send button.

The panel should read as an AI assistant/editor command surface, not a property inspector. Keep controls tied to selected time ranges, frames, and edit operations.

## Do's and Don'ts

### Do

- Default to Porcelain light editorial styling.
- Keep the editor simple: preview, timeline, cursor/zoom/manual edit controls, and full-height chat panel.
- Use Instrument Sans for UI and IBM Plex Mono for technical/timecode text.
- Preserve the 70/30 preview-to-AI-panel layout from the mocks.
- Use primary ink-blue for selection, playhead, active tools, and primary actions.
- Keep timeline and controls compact; this is a demo-specific editor.

### Don't

- Do not build a full video editor or Figma-like object selection UI.
- Do not add a separate selected-object inspector that competes with the AI panel.
- Do not mix Porcelain, Graphite, and Nocturne tokens in one screen except in a theme picker/demo.
- Do not invent new accent colors beyond the token set.
- Do not use large marketing-style typography inside the editor chrome.
- Do not make the UI feel like generic Tailwind defaults; use the extracted mock tokens.
