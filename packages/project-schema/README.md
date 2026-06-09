# @tinker/project-schema

Shared TypeScript/Zod contract for editable demo projects.

Person A produces valid `DemoProject` files from product analysis, storyboarding, and capture.
Person B consumes and edits valid `DemoProject` files in the editor/export pipeline.

The canonical sample fixture is `fixtures/demo-project.sample.json`.

## MVP shape

Schema `0.2.0` is intentionally simple:

- video assets and video tracks only
- cursor events
- auto zoom and manual zoom regions
- trim, speed, zoom, and remove operations
- no captions, callouts, narration assets, or separate audio tracks

## Core rule

The MP4 is an export artifact. `DemoProject` is the source of truth.

## Commands

```bash
pnpm --filter @tinker/project-schema typecheck
pnpm --filter @tinker/project-schema validate:sample
```
