# Core MVP Checklist

## MVP Principle

The MVP should make one workflow extremely reliable:

```text
Load or generate a captured web-app demo project
  -> preview real captured media
  -> trim clips
  -> apply cursor/click effects and zoom/camera motion
  -> save the editable project
  -> export an MP4 that matches preview
```

Out of MVP scope:

- captions
- callouts
- text overlays or text rendering
- audio/voiceover timeline
- audio mixing
- desktop automation
- generic video editing

---

## Linear-Style Tickets

### MVP-001: Remove text/audio scope from product surface

**Priority:** P0  
**Owner:** Person B  
**Status:** Done

**Goal:** Remove captions, callouts, text rendering, and audio/voiceover timeline from the MVP contract and UI so the product focuses on captured video, cursor, zoom, trim, and export.

**Checklist:**

- [x] Remove `captions` and `callouts` from `DemoProject` schema or explicitly migrate them out of MVP compatibility mode.
- [x] Remove `Caption`, `Callout`, `add_caption`, and `add_callout` types from shared operation contracts.
- [x] Remove caption/callout rows from timeline model and tests.
- [x] Remove caption/callout/text overlays from preview.
- [x] Remove caption/callout/text layers from render/export planning.
- [x] Remove caption/callout controls from editor UI.
- [x] Remove caption/callout operations from AI edit mock responses.
- [x] Remove narration/voiceover fields from Create Demo UI and generation request copy.
- [x] Update fixtures so sample projects contain only assets, tracks, clips, zooms, cursor events, AI history, and metadata.
- [x] Update docs that still describe captions, callouts, text overlays, or audio as MVP features.

**Acceptance criteria:**

- [x] `rg "caption|callout|add_caption|add_callout|voiceover|narration"` returns only historical docs, explicit non-goal mentions, and negative tests.
- [x] `pnpm validate:schema`, `pnpm typecheck`, and `pnpm -r test` pass.
- [x] A sample project loads without any caption/callout/audio fields.

---

### MVP-002: Harden asset resolution

**Priority:** P0  
**Owner:** Person B  
**Status:** Done

**Goal:** Make local asset handling deterministic and safe for preview/export.

**Checklist:**

- [x] Define one resolver path for browser preview URLs.
- [x] Define one resolver path for Node/export file paths.
- [x] Reject unsupported URI schemes in local export.
- [x] Detect missing files before export starts.
- [x] Detect asset type and MIME mismatches.
- [x] Normalize relative paths against a known project root, not process cwd.
- [x] Prevent path traversal outside approved project and allowed input roots.
- [x] Return structured errors with asset id, asset uri, and failing consumer.
- [x] Add a valid local video fixture and tests for missing asset, unsupported remote URL, and path traversal.

**Acceptance criteria:**

- [x] Preview shows a non-crashing placeholder for missing media.
- [x] Export fails before invoking ffmpeg when required media is missing or unsafe.
- [x] Tests cover local, remote, missing, malformed, and traversal paths.

---

### MVP-003: Wire motion-core into preview

**Priority:** P0  
**Owner:** Person B  
**Status:** Done

**Goal:** Preview should use the same cursor and camera math intended for final export.

**Checklist:**

- [x] Normalize cursor events through `normalizeCursorTelemetry`.
- [x] Smooth cursor positions through `smoothCursorTelemetry` or sampled equivalent.
- [x] Normalize zoom keyframes through `normalizeZoomRegions`.
- [x] Resolve active camera transforms through `resolveCameraTransformWithCursorFollow`.
- [x] Apply camera transform to the preview media layer.
- [x] Render cursor/click effects from normalized cursor positions.
- [x] Keep transform behavior deterministic when seeking backward and forward.
- [x] Remove old hardcoded `x / 19.2` and `y / 10.8` coordinate assumptions.

**Acceptance criteria:**

- [x] Preview cursor position is correct for 16:9, 9:16, and 1:1 projects.
- [x] Active zoom changes the actual media transform, not just a rectangle overlay.
- [x] Seeking to the same timestamp always produces the same preview state.

---

### MVP-004: Add auto-zoom suggestion flow

**Priority:** P1  
**Owner:** Person B  
**Status:** Done

**Goal:** The editor should propose useful zooms from cursor dwell without mutating the project until accepted.

**Checklist:**

- [x] Add a “suggest zooms” action in the editor.
- [x] Generate suggestions with `suggestAutoZooms`.
- [x] Show suggestions as preview-only proposed zooms.
- [x] Let the user accept all suggestions.
- [x] Let the user reject suggestions without changing the project.
- [x] Apply accepted suggestions through existing command/history paths.
- [x] Avoid adding duplicate/overlapping zooms.

**Acceptance criteria:**

- [x] Suggestions are deterministic from the same cursor events.
- [x] Accepting suggestions creates undoable project changes.
- [x] Rejecting suggestions leaves the project unchanged.

---

### MVP-005: Replace placeholder export with real media export

**Priority:** P0  
**Owner:** Person B  
**Status:** Done

**Goal:** Export should produce an MP4 from real project media, not lavfi placeholders.

**Checklist:**

- [x] Freeze a validated project snapshot at export start.
- [x] Resolve source video assets before invoking ffmpeg.
- [x] Respect clip `start`, `end`, `sourceStart`, and `sourceEnd`.
- [x] Compose multiple video clips in timeline order.
- [x] Apply motion-core camera transforms to exported frames.
- [x] Render cursor/click effects over media.
- [x] Keep export output dimensions tied to `aspectRatio`.
- [x] Probe output with `ffprobe`.
- [x] Return structured export result with artifact path, duration, dimensions, and probe summary.

**Acceptance criteria:**

- [x] A fixture with one real video clip exports visible source media.
- [x] A trimmed fixture exports only the intended source segment.
- [x] A zoom fixture exports visibly transformed media during the zoom window.
- [x] A cursor fixture exports cursor/click effects in the correct positions.

---

### MVP-006: Build export job state machine

**Priority:** P1  
**Owner:** Person B  
**Status:** Done

**Goal:** Export should be observable, cancellable later, and impossible to corrupt by editing during render.

**Checklist:**

- [x] Define export states: `idle`, `validating`, `rendering`, `probing`, `succeeded`, `failed`.
- [x] Freeze project snapshot before validation.
- [x] Store progress and current phase separately from project state.
- [x] Surface validation errors before render starts.
- [x] Surface ffmpeg/probe errors with actionable messages.
- [x] Prevent concurrent exports from writing the same output path.

**Acceptance criteria:**

- [x] Editing the project during export cannot change the in-flight snapshot.
- [x] Failed validation never creates a partial artifact.
- [x] Failed render reports phase, command context, and error message.

---

### MVP-007: Security audit pass

**Priority:** P0  
**Owner:** Person B with Person A review for shared contracts  
**Status:** Done

**Goal:** Ensure local project loading, asset resolution, generation inputs, and export do not create obvious local security risks.

**Checklist:**

- [x] Validate all loaded project JSON with runtime schemas before use.
- [x] Reject project files above a defined safe size.
- [x] Reject unknown schema versions unless a migration exists.
- [x] Do not execute scripts from loaded projects.
- [x] Do not pass user-controlled strings into shell commands through a shell.
- [x] Pass ffmpeg arguments as argv arrays only.
- [x] Restrict export output to explicit user-selected or app-owned directories.
- [x] Block path traversal in asset URIs and output paths.
- [x] Reject `file://` paths outside approved roots in desktop/local modes.
- [x] Treat remote URLs as non-exportable until a download/cache policy exists.
- [x] Redact local paths from user-facing errors when appropriate.
- [x] Confirm generated projects cannot inject HTML/JS into the app shell.

**Acceptance criteria:**

- [x] Security checklist is represented by tests where practical.
- [x] Remaining manual checks are documented with the reason they cannot be automated yet.
- [x] `git grep` confirms no export path uses `shell: true`.

---

### MVP-008: Edge-case regression fixture suite

**Priority:** P0  
**Owner:** Person B  
**Status:** Done

**Goal:** Stop regressions by testing ugly project states before users hit them.

**Checklist:**

- [x] Fixture: empty tracks.
- [x] Fixture: one valid video clip.
- [x] Fixture: multiple clips with a gap.
- [x] Fixture: trimmed clip.
- [x] Fixture: overlapping clips on separate tracks.
- [x] Fixture: missing asset.
- [x] Fixture: invalid asset reference.
- [x] Fixture: cursor events outside frame bounds.
- [x] Fixture: duplicate timestamps.
- [x] Fixture: zoom target outside frame bounds.
- [x] Fixture: 16:9, 9:16, and 1:1 aspect ratios.
- [x] Fixture: very short project under 1 second.
- [x] Fixture: long project over 3 minutes.

**Acceptance criteria:**

- [x] Each fixture has schema validation coverage.
- [x] Each exportable fixture has render-plan coverage.
- [x] Missing/invalid fixtures fail with structured errors, not crashes.

---

### MVP-009: Preview/export parity checks

**Priority:** P0  
**Owner:** Person B  
**Status:** Done

**Goal:** The final MP4 should match what the editor preview communicates.

**Checklist:**

- [x] Share motion transform calculations between preview and export.
- [x] Share coordinate normalization between preview and export.
- [x] Add snapshot-style assertions for camera transform at fixed timestamps.
- [x] Add frame-sampled animated ramp/easing parity for export.
- [x] Add cursor-follow export parity.
- [x] Add export tests that verify dimensions, duration, and stream presence.
- [x] Add frame-level smoke checks for at least one zoom/cursor fixture.

**Acceptance criteria:**

- [x] Same timestamp plus same project produces same camera transform in preview and export code paths.
- [x] Aspect ratio changes do not misplace cursor or zoom focus.
- [x] Animated zoom ramps/easing and cursor-follow behavior match preview in exported frames.

---

### MVP-010: Final MVP gate

**Priority:** P0  
**Owner:** Person B  
**Status:** Done

**Goal:** Define the bar before calling the core MVP ready.

**Checklist:**

- [x] A user can load a valid project.
- [x] A user can preview real captured media.
- [x] A user can trim a clip and undo/redo the edit.
- [x] A user can apply or edit zoom/camera motion and undo/redo the edit.
- [x] Cursor/click effects appear in preview.
- [x] Exported MP4 contains real source media.
- [x] Exported MP4 reflects trim, cursor/click effects, and zoom/camera motion.
- [x] Missing or unsafe assets fail gracefully.
- [x] Invalid project JSON fails gracefully.
- [x] Full validation suite passes.

**Required commands before MVP signoff:**

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-core-mvp-smoke.mp4
```
