# Click-First Autozoom Design

## Goal

Improve automatic zoom accuracy for generated demos and editor auto-zoom suggestions by using one shared interaction-interest model. The model should prioritize exact clicks, fall back to stable cursor dwell, and use OpenScreen-inspired distance-adaptive camera follow inside active zooms.

## Current Behavior

Generated demos build zooms in `packages/demo-assembly/src/compileProject.ts` from `zoomTarget` capture events. Each target is held for 2.5 seconds and adjacent targets are merged. This can produce broad or stale targets when cursor movement and clicks do not align with the emitted target rectangle.

Editor auto-zoom suggestions call `suggestAutoZooms` from `packages/motion/src/autoZoomSuggestions.ts`. The current detector only finds runs where the normalized cursor moves less than a dwell threshold. This misses fast click interactions and can average the cursor location away from the actual click target.

Camera follow in `packages/motion/src/cameraTransform.ts` uses a hard safe-zone jump. OpenScreen uses interpolated cursor positions plus distance-adaptive smoothing, which is a better fit for following cursor movement without sudden recentering.

## Proposed Architecture

Add a shared motion-layer interaction targeting helper in `packages/motion`. The helper will accept cursor events, frame dimensions, project duration, and optional existing zooms. It will produce ranked interaction focus candidates that can be converted into `ZoomKeyframe` objects.

Candidate types:

- `click`: highest priority. Centered on the click position. Starts slightly before the click and holds after it.
- `dwell`: lower priority. Uses the existing sustained-stillness detector for moments where there is no click.
- `explicit`: optional adapter for capture-side `zoomTarget` rectangles. Used when available, but nearby click candidates can refine the target center.

Consumers:

- `suggestAutoZooms` uses the shared candidate generator instead of dwell-only detection.
- `compileProject` converts capture cursor and click events into the same shared candidate model. Existing `zoomTarget` events remain usable as explicit context, but click candidates should refine or supersede temporally close broad targets.
- `cameraTransform` replaces the hard safe-zone jump with a deterministic OpenScreen-style distance-adaptive follow factor for active zooms.

## Candidate Rules

Click candidates:

- Time window: begin 0.25 seconds before the click and hold 1.1 seconds after the click, clamped to project duration.
- Focus: exact normalized click point.
- Target size: use the existing default target size unless an explicit target overlaps the click window, contains the click point, and has less area than the default target.
- Ranking: always outrank dwell candidates when their time windows overlap.

Dwell candidates:

- Preserve the existing minimum dwell, maximum dwell, movement threshold, spacing, and existing-zoom overlap behavior.
- Continue to use average cursor focus for sustained cursor pauses.
- Fill gaps where no click candidate was accepted.

Explicit capture targets:

- Preserve explicit targets that have no nearby click.
- When an explicit target overlaps a click candidate in time, prefer the click candidate's focus while optionally borrowing the explicit target size if it is tighter than the default target size.
- Treat an explicit target as nearby when its time window overlaps the click window.
- Avoid merging unrelated targets only because their holds touch; merge only when windows overlap and normalized focus distance is at most 0.1.

## Camera Follow

Keep camera transform deterministic for export and preview parity. Replace hard recentering when the cursor leaves a safe zone with a distance-adaptive follow step based on OpenScreen's approach:

- Interpolate the cursor at the current content time.
- Compute distance from current focus to raw cursor focus.
- Use a low factor for small movement and a higher factor for larger movement.
- Time-correct the factor so preview and export converge similarly at different frame rates.
- Continue freezing focus during zoom-out once full zoom has been reached, preserving existing behavior that avoids drifting during ramp-out.

This should improve perceived accuracy without copying OpenScreen code directly.

## Data Flow

1. Normalize cursor/click events with existing `normalizeCursorTelemetry`.
2. Build click candidates from click points.
3. Build dwell candidates from the existing dwell detector.
4. Add optional explicit candidates from capture `zoomTarget` events.
5. Rank candidates by priority, then confidence, then duration, then time. Click confidence is `2`, explicit confidence is `1.5`, and dwell confidence is its dwell duration in seconds capped at `1`.
6. Accept candidates with existing spacing and overlap rules.
7. Convert accepted candidates into `ZoomKeyframe` targets.
8. Render/export uses the same normalized zooms and deterministic camera transform path as today.

## Error Handling

- Invalid or empty duration returns no suggestions.
- Invalid frame dimensions fall back to the current safe frame handling.
- Cursor points outside the frame are clamped by existing normalization.
- Overlapping candidates are resolved deterministically; no random ranking or wall-clock input.

## Testing

Add motion tests that prove:

- A click during movement produces a zoom centered on the click instead of being ignored.
- Click candidates outrank overlapping dwell candidates.
- Dwell-only input still produces the existing style of suggestions.
- Explicit capture targets without nearby clicks are preserved.
- A broad explicit target near a click is refined toward the click focus.
- Candidate IDs and ordering remain deterministic.
- Distance-adaptive camera follow moves partially toward far cursor targets instead of jumping instantly, while preserving zoom-out freeze behavior.

Add demo-assembly tests that prove:

- `compileProject` creates click-first zooms from capture click/cursor events.
- Existing explicit `zoomTarget` events still work when no clicks are present.
- Nearby click and explicit target events do not merge into a broad inaccurate zoom.

## Scope

In scope:

- Shared candidate generation in `packages/motion`.
- Updating editor auto-zoom suggestions to use the shared model.
- Updating generated demo compilation to use the shared model.
- Deterministic OpenScreen-inspired camera follow improvements.

Out of scope:

- Copying OpenScreen implementation code.
- New UI for tuning auto-zoom parameters.
- DOM-element-level Playwright target extraction changes.
- Non-deterministic or ML-based target selection.
