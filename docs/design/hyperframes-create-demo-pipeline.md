# HyperFrames Create Demo Pipeline

## Goal

Connect the default local product workflow around Samuel's HyperFrames generation path:

```text
repo URL + demo description
  -> POST /api/jobs with renderer=hyperframes
  -> open returned HyperFrames composition in the editor
  -> allow secondary AI edits on the job
  -> export the current rendered composition
```

## Current State

`apps/web/src/App.tsx` already mounts `CompositionDemoScreen` with real HTTP generation and edit clients. `CompositionDemoScreen` already posts `ai-url-planning` jobs, waits for completion, and opens `result.method === "hyperframes"` jobs in `CompositionEditorScreen` using the returned composition index and output video artifacts.

The API route accepts a renderer and the local generation worker can run either HyperFrames or Playwright. The current web app is composition-editor-first, so HyperFrames is the only complete path for generation, secondary edits, and export.

## Design

Add a small generation-method selector on the Create Demo page:

- HyperFrames is selected by default and is the only enabled method for this milestone.
- Playwright is visible as a future option but disabled so users can see the planned split without accidentally starting a workflow the current app cannot finish.
- Generate always submits `renderer: "hyperframes"` while HyperFrames is selected.
- The existing result handoff remains unchanged: completed HyperFrames jobs open in `CompositionEditorScreen` with `jobId` and `editClient`, preserving secondary edits and export.

This keeps the shipped path honest while leaving the UI affordance Dongha asked for.

## Testing

Add focused web tests that prove:

- the Create Demo page shows the method selector;
- HyperFrames is selected by default;
- Playwright is visible but disabled/future;
- Generate submits `renderer: "hyperframes"`;
- the existing completed HyperFrames job still opens in the editor.

Run the focused web test suite, typecheck, and web build before committing.
