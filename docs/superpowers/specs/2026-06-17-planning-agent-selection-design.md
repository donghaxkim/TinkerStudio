# Planning Agent Selection Design

## Goal

Let users choose whether the planning session runs with OpenCode or Claude Code, with OpenCode as the default. The selected planning agent should apply to the initial planning turn and all follow-up planning messages for that session.

## Current State

- The frontend always creates planning sessions with `agent: "claude"`.
- The generation contract already defines `PlanningAgent` as `"claude" | "opencode"`, but defaults planning requests to Claude.
- The API stores the selected planning agent on each planning session and reuses it for follow-up turns.
- The current planning runner rejects `agent: "opencode"` with a resumable-adapter error.
- Hyperframes generation already has an OpenCode/Claude selector and defaults to OpenCode.

## User Experience

- Add a `Planning agent` selector near the URL planning controls.
- The selector offers `OpenCode` and `Claude Code`.
- The selector defaults to `OpenCode`.
- `Plan demo` sends the selected value as `agent` in the create-session request.
- After a planning session starts, follow-up messages continue using the stored session agent; the follow-up message request does not need to resend the agent.
- The existing Hyperframes generation agent selector remains separate because planning and generation are different phases.

## Backend Behavior

- Change the planning request default agent from Claude to OpenCode in the shared contract.
- Preserve the current Claude planning path unchanged for `agent: "claude"`.
- Add an OpenCode planning path for `agent: "opencode"` inside the planning runner.
- Initial OpenCode planning should perform the same website and repo analyses as Claude planning, write the same workspace evidence files, and prompt OpenCode to maintain `outline.json` only.
- Follow-up OpenCode planning should resume the same OpenCode session using the stored resume handle and update `outline.json` when needed.
- OpenCode planning must return a non-empty resume handle. If the CLI output cannot provide one, the request should fail clearly instead of creating a non-resumable session.

## Safety And Boundaries

- Keep the same workspace write boundary used by Claude planning: only `outline.json` and runner-owned log files may change.
- Use OpenCode-specific log files so Claude and OpenCode diagnostics do not collide.
- Use a sanitized environment when spawning OpenCode.
- Keep repository checkout and analysis artifacts read-only from the agent's perspective.

## Testing

- Frontend tests verify the planning agent selector defaults to OpenCode.
- Frontend tests verify create-session sends `agent: "opencode"` by default.
- Frontend tests verify switching to Claude sends `agent: "claude"`.
- Contract tests verify omitted planning agent defaults to OpenCode and both explicit values remain valid.
- API/runner tests verify OpenCode initial planning succeeds when the runner returns an assistant message and resume handle.
- API/runner tests verify OpenCode follow-up uses the stored session agent and resume handle.
- Existing Claude planning tests should continue to pass.

## Out Of Scope

- Sharing one selector between planning and Hyperframes generation.
- Changing the outline schema.
- Changing the planning chat UI beyond adding the selector.
- Making Playwright generation use the planning agent value.
