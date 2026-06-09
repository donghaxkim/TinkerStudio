# Tinker Simplified Editor UI Direction

## Purpose

This document captures Dongha's direction for the Tinker editing layout.

Tinker is not trying to become a general video editor. The editor should feel like a focused screen-recording workspace where the user can preview the current `DemoProject`, select moments in the timeline, and ask the AI copilot to improve those moments with structured edit operations.

The core UI principle:

```text
AI is the editor copilot, not a small helper button.
```

That means chat is a first-class editing surface, not an afterthought.

The desired product feel is:

```text
Screen Studio + Cursor-inspired web UI
```

Screen Studio is the editing reference: clean preview, cursor zoom, manual zoom, trim, speed, and simple screen-recording polish. Cursor is the AI workflow reference: a full-height chat/composer that can receive selected ranges and propose edits.

## Current Product Context

From the existing docs:

- Tinker is "Screen Studio for agents."
- Person B, Dongha, owns the editor side:
  - app shell
  - timeline
  - preview
  - manual edit UX
  - AI edit UX
  - export
- `DemoProject` is the source of truth.
- MP4 is only an export artifact.
- AI edits should return structured operations that can be previewed, accepted, rejected, validated, and undone.
- MVP edit scope is strictly auto zoom, manual zoom, trim, speed, and basic clip edits.

The current repo does not yet contain a committed web editor UI. This document should guide the first real editor layout and prevent the early UI from feeling ugly, cramped, or generic.

## Recommended Editing Layout

Use a two-column editor.

Left side, about 70 percent:

- Preview
- Playback controls
- Timeline

Right side, about 30 percent:

- Full-height chat history
- Attachment cards
- AI edit suggestions
- Composer fixed at the bottom

```text
+-----------------------------------------------+--------------------+
|                                               |                    |
|                 Preview                       |                    |
|                                               |                    |
|                                               |                    |
+-----------------------------------------------+      Chat          |
| Timeline                                      |                    |
| video / zooms / trims / speeds                |                    |
+-----------------------------------------------+--------------------+
```

The right chat panel extends from top to bottom, including beside the timeline.

This matters because the chat needs room for:

- long edit instructions
- selected time ranges
- screenshots and thumbnails
- uploaded images
- design references
- product docs
- competitor demo videos
- prompt history
- accepted and rejected edit suggestions

Do not use a small chat box below the preview or a collapsed helper widget as the primary AI UI. That would make the AI feel secondary.

## Why Full-Height Chat Is The Right Call

A small chat box says:

```text
AI is a little helper button.
```

A full-height chat panel says:

```text
AI is the editor copilot.
```

For Tinker, the second framing is the product. The user should feel like they are editing with an AI partner that understands the selected part of the demo.

## MVP Layout Rules

The first editor screen should prioritize work, not decoration.

- Preview and timeline remain visually dominant.
- Chat is always visible on desktop.
- The composer is fixed to the bottom of the chat panel, Cursor-style.
- The timeline supports selected time ranges early.
- Attachments are shown as compact cards inside chat.
- Proposed AI edits appear in chat with clear apply/review actions.
- Do not add a permanent heavy object inspector in the MVP.
- Do not build a CapCut-style general editor.
- Do not build captions, callouts, narration, separate audio tracks, or text-overlay editing in the MVP.

Chat panel shape:

```text
+ Chat ---------------------+
| user messages             |
| selected clip cards       |
| AI suggestions            |
|                           |
|                           |
+---------------------------+
| [+] Ask Tinker...         |
+---------------------------+
```

## Interaction Model

The most important interaction is selected timeline range to chat.

Flow:

```text
User drags on timeline
  -> selected range appears
  -> floating "Add to chat" action appears
  -> chat receives a selected clip attachment card
  -> user asks for an edit
  -> Tinker proposes structured operations
  -> user applies or reviews
```

Example range selection:

```text
00:12.4 --------- 00:18.0

[Add to chat]
```

Chat card:

```text
Selected clip
00:12.4-00:18.0
[thumbnail] [thumbnail] [thumbnail]
```

Example user prompts:

```text
make this section faster and zoom into the click
auto zoom this part
draw a manual zoom around the product card
trim this pause
```

Example AI response:

```text
Tinker suggests:
- speed up dead time from 00:12.4-00:14.0 to 2x
- add auto zoom around cursor click at 00:15.2
- trim 0.6s pause after loading

[Apply 3 edits] [Review]
```

## Attachment Types

Support attachments early. They are central to making chat useful for video editing.

Minimum V1 attachment types:

1. Selected video time range
2. Screenshot or frame from current time
3. Uploaded images
4. Uploaded files and docs
5. Links

Later attachment types:

1. User repo files
2. Existing demo videos
3. Brand assets
4. Product screenshots
5. Voiceover scripts

Recommended internal shape:

```ts
type ChatAttachment =
  | {
      type: "time_range";
      startMs: number;
      endMs: number;
      thumbnails: string[];
      transcript?: string;
      cursorEvents?: CursorEvent[];
      zoomRegions?: ZoomRegion[];
    }
  | {
      type: "current_frame";
      timeMs: number;
      imageUri: string;
    }
  | {
      type: "uploaded_image";
      imageUri: string;
      filename: string;
    }
  | {
      type: "uploaded_file";
      fileUri: string;
      filename: string;
      mimeType: string;
    }
  | {
      type: "link";
      url: string;
    };
```

The most important attachment is `time_range`. This is the simplified "lasso" for the video editor.

## Current Frame Attachment

Add a button near the preview:

```text
Add frame to chat
```

This should attach the current preview frame to the composer or active chat thread.

Useful prompts:

```text
make this screen look more polished
add a callout here
why does this look awkward?
```

## File And Image Attachment UX

The chat composer should work like Cursor:

```text
[+] [drag files here] [type request...]
```

Useful attachments:

- brand guideline PDF
- logo
- screenshot reference
- competitor video still
- script doc
- user-provided mockup

## Editing Controls

Keep editing simple.

The right panel is:

```text
Chat + attachments + proposed edits
```

It is not a permanent properties inspector.

If the user selects a zoom, trim, or speed region, settings can appear inline or as a small popover near the timeline.

Example popover controls:

```text
Zoom depth: 1.5x / 2x / 3x
Speed: 0.5x / 1x / 2x / 4x
```

This keeps the editor focused and avoids turning the MVP into a full video editing suite.

## Zoom Modes

There are two zoom modes.

### Auto Zoom

Auto zoom follows cursor and click movement inside a selected range. The user selects a range and asks Tinker to auto zoom, or clicks the auto zoom control.

Default:

```text
scale: 2x
target: generated from cursor/click events inside [start, end)
```

If the range has no cursor events, auto zoom should fail gracefully and ask for a different range or a manual zoom.

### Manual Zoom

Manual zoom is the Screen Studio-style precision control. The user places a zoom target on the preview or selected timeline range and can adjust:

```text
range
target rectangle
scale
easing
```

Manual zoom is for exact framing when cursor-following is not enough.

## AI Edit Operations

The desired UI should support simple, constrained operation proposals.

All operation times are project timeline seconds. Ranges are start-inclusive and end-exclusive: `[start, end)`.

```ts
type EditOperation =
  | {
      type: "auto_zoom";
      start: number;
      end: number;
      scale: number;
    }
  | {
      type: "add_zoom";
      start: number;
      end: number;
      target: Rect;
      scale: number;
      easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
    }
  | {
      type: "trim";
      start: number;
      end: number;
    }
  | {
      type: "speed";
      start: number;
      end: number;
      speed: 0.5 | 1 | 2 | 4;
    }
  | {
      type: "remove_zoom";
      id: string;
    }
  | {
      type: "remove_clip";
      id: string;
    };
```

Range validation:

```text
0 <= start < end <= project.duration
```

Speed semantics:

```text
range 10s-20s at 2x
source segment = 10s
new timeline segment = 5s
duration delta = -5s
later entities shift left by 5s
```

AI response UI:

```text
Tinker suggests:
[Apply 3 edits] [Review]
```

The user should be able to:

- preview proposed edits
- accept all proposed edits
- review operations one by one
- reject the proposal
- undo accepted edits

## Visual Direction

The editor should feel like a serious creative tool:

- calm, dense, and legible
- high trust
- low decoration
- clear hierarchy between preview, timeline, and chat
- restrained color, with accent color reserved for selection, active state, focus, and apply actions
- consistent controls across timeline, preview, and chat

Avoid:

- decorative cards everywhere
- nested panels
- oversized marketing-style headings
- a tiny AI widget
- a cluttered inspector
- a generic video editor feel

The UI should borrow the task clarity of Screen Studio/OpenScreen and the AI workflow feeling of Cursor.

## Implementation Notes For Person B

Build the layout in this order:

1. App shell with two-column editor layout.
2. Preview area with playback controls.
3. Timeline with click-to-seek and visible selected range.
4. Full-height chat side panel with fixed composer.
5. "Add selected range to chat" action.
6. "Add frame to chat" action.
7. Attachment cards in chat.
8. Auto zoom and manual zoom controls.
9. Trim and speed controls.
10. Mock AI suggestions using v0.2 schema operations.
11. Apply/review/reject proposal controls.
12. Later: uploaded files, uploaded images, and links.

Keep the MVP constrained:

- no permanent inspector
- no generic object-properties sidebar
- no broad editing tool palette
- no direct AI mutation of video files
- no export-first MP4 workflow
- no captions, callouts, narration, or separate audio tracks

Everything should flow through `DemoProject`.

## Final Take

The right MVP editor is:

```text
Screen Studio-style editing surface
+ full-height Cursor-style composer
+ time-range, frame, file, and link attachments
+ auto zoom, manual zoom, trim, speed, and basic structured AI edit operations
```

That is the focused, differentiated version of Tinker.
