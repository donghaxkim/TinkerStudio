# Default Demo Video Structure Design

## Goal

Make generated demo videos default to a conversion-oriented narrative structure:

1. Hook
2. Demo: Use Case
3. End Result
4. CTA

This structure should improve the first draft of generated demos without preventing users from changing the outline during planning.

## Current Context

Tinker has two relevant generation paths:

- Hyperframes generation uses planning sessions that maintain an approved `outline.json`, then passes that approved outline through `approvedDemoBrief` to the Hyperframes generation agent.
- Playwright/AI URL generation creates a `storyboard` and deterministic `capturePlan`. The storyboard already supports beat types: `hook`, `screen_capture`, `feature`, `proof`, and `cta`.

The planning-first Hyperframes flow is the right place to suggest the default structure because users can review and revise the outline before generation. The Playwright/storyboard flow should use the same default arc so capture intent and final narrative do not drift apart.

## Design

Use `Hook -> Demo: Use Case -> End Result -> CTA` as the default narrative arc for generated demos.

For Hyperframes planning:

- The initial planning prompt should instruct the planning agent to draft `outline.json` with this default structure.
- The instruction should describe the structure as a starting recommendation, not a constraint.
- Follow-up planning turns should preserve the default arc unless the user asks for a different narrative structure.
- If the user asks to change the structure, the planning agent should update `outline.json` to match the user's requested structure.

For Hyperframes generation:

- The generation prompt should preserve the approved outline's structure.
- It should not force the default arc if the approved outline has been changed during planning.
- It should still use the approved outline for title, scene goals, pacing, and generation notes.

For Playwright/AI URL planning:

- The storyboard prompt should use the same default arc.
- The default mapping is:
  - Hook -> `hook`
  - Demo: Use Case -> `screen_capture` or `feature`
  - End Result -> `proof`
  - CTA -> `cta`
- The capture plan should prioritize product actions that support the use case and reveal the end result, rather than producing a generic homepage tour.

## Data Model

No schema change is required.

`DemoOutline.scenes` remains flexible so user-directed outline changes do not require migrations or backward-compatibility handling. Playwright storyboards already support the needed beat types.

## Testing

Add prompt-level tests that verify:

- The Hyperframes initial planning prompt includes the default structure.
- The Hyperframes follow-up planning prompt tells the agent that user-requested structure changes override the default.
- The Hyperframes generation prompt preserves the approved outline and does not re-force the default after approval.
- The Playwright/AI URL planner prompt includes the default arc and beat mapping.

## Non-Goals

- Do not add a new UI selector for demo styles in this change.
- Do not require every outline to have exactly four scenes.
- Do not change generated video rendering, export, or timeline schemas.
- Do not block users from deleting, reordering, or renaming the default sections during planning.
