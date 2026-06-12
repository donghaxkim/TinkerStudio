# Motion Logic Core Design

## Status

Approved for implementation planning.

## Goal

Add a backend-only motion logic core in `packages/editor/src/motion/` that turns existing `DemoProject.cursorEvents` and `DemoProject.zooms` into deterministic camera, cursor, and auto-zoom utilities. The utilities should be pure TypeScript functions that can later be consumed by preview, export, or UI code without changing the project schema.

## Non-Goals

- No `DemoProject` schema changes and no edits under `packages/project-schema`.
- No UI wiring, timeline controls, preview integration, export integration, or automatic project mutation.
- No capture pipeline changes and no dependency on browser APIs.
- No large OpenScreen or Recordly file ports; only small pure algorithms may be translated.

## Public APIs

Create focused modules under `packages/editor/src/motion/` and export them from `packages/editor/src/index.ts`:

- `cursorTelemetry.ts`: normalize existing cursor events into sorted, clamped, normalized cursor points; interpolate and smooth cursor paths deterministically.
- `autoZoomSuggestions.ts`: detect dwell candidates and produce suggested `ZoomKeyframe`-shaped ranges with deterministic ids, spacing, and existing-zoom exclusion.
- `cameraTransform.ts`: normalize zoom keyframes into regions, resolve frame/time camera transforms, and compute pure cursor-follow state updates.
- `index.ts`: local barrel for motion exports.

APIs should accept plain data from `@tinker/project-schema` types and return plain typed objects. They should not mutate `DemoProject`, create history commands, validate whole projects, or write suggested zooms back to `project.zooms`.

## Source Inspirations

Use OpenScreen and Recordly as algorithm references only:

- cursor smoothing and velocity thresholds
- click-centered zoom windows
- camera target interpolation
- cursor-follow easing and bounds clamping

Translate the ideas into Tinker-shaped, testable functions over `CursorEvent`, `ZoomKeyframe`, frame dimensions, and timestamps. Do not copy app-coupled state managers, renderers, React components, stores, or project mutation flows.

## Data Flow

1. Consumers pass `DemoProject.cursorEvents`, `DemoProject.zooms`, project duration, and frame size into pure motion utilities.
2. Cursor telemetry normalizes event ordering and derives sampled cursor state.
3. Auto-zoom suggestion logic inspects telemetry windows and returns proposed zoom keyframes separately from the project.
4. Camera transform logic combines existing zoom keyframes and optional cursor-follow settings into a render-neutral transform object.
5. Later preview or export code may opt in by calling these utilities, but this task does not wire those callers.

## Testing

Add Vitest coverage next to each motion module:

- cursor event sorting is stable and input arrays are not mutated
- latest cursor sampling ignores future events and handles empty input
- velocity and activity windows handle sparse, duplicate-time, click, move, and scroll events
- auto-zoom suggestions are deterministic, clamped, duration-safe, and can exclude windows already covered by zooms
- camera transform interpolation handles no zoom, active zoom, overlapping zoom priority, easing, clamping, and cursor-follow behavior

Use `packages/editor/src/test/sampleProject.ts` where useful, plus small inline fixtures for edge cases.

## Constraints

- Keep `DemoProject` stable and do not touch `packages/project-schema`.
- Scope implementation to `packages/editor/src/motion/`, tests, and `packages/editor/src/index.ts` exports.
- Utilities must be deterministic, side-effect free, and safe for Node and browser callers.
- Prefer small files with one clear responsibility.
- No formatter-only churn and no unrelated refactors.
