# Hyperframes Agent Selection Design

## Goal

Hyperframes generation and repair should be able to run with either OpenCode or Claude Code. OpenCode remains the default. A runtime environment variable selects Claude Code when desired, without changing the existing Hyperframes sandbox, repository snapshot, generated output copy-back, logging, timeout, or cleanup behavior.

## Current Behavior

`packages/demo-assembly/src/hyperframesPlanning.ts` owns the production agent runner for Hyperframes project generation and repair. The exported generator and repairer build JSON prompts, prepare `hyperframesDir/.tinker-opencode-workspace`, copy a filtered source repository snapshot under `repository/`, copy existing generated output into the sandbox for repairs, spawn OpenCode, retain stdout and stderr logs, copy generated files back to `hyperframesDir`, and remove the sandbox.

The production spawn command is currently hard-coded:

```sh
opencode run --pure --format json --dir <sandbox> <prompt>
```

`packages/demo-assembly/src/runAiUrlDemo.ts` defaults to `createOpencodeHyperframesGenerator()` and `createOpencodeHyperframesRepairer()` when no test dependency is injected, so the agent choice must be handled by those defaults.

## Approved Design

Add a small Hyperframes agent selection layer inside `hyperframesPlanning.ts`.

Supported values:

- `opencode`
- `claude`

Selection order:

- Read `TINKER_HYPERFRAMES_AGENT`.
- Default to `opencode` when the variable is unset or blank.
- Throw a clear error for unknown values.

The runner lifecycle remains shared. The selected agent only changes the command, arguments, and human-readable error label used by the existing spawn/logging code.

OpenCode command:

```sh
opencode run --pure --format json --dir <sandbox> <prompt>
```

Claude Code command:

```sh
claude -p <prompt> --output-format text
```

Claude Code should inherit its normal default/global permissions. Tinker must not pass `--permission-mode`, `--dangerously-skip-permissions`, or `--allow-dangerously-skip-permissions` for the Claude runner.

OpenCode should continue to inherit normal default/global permissions. Tinker must not reintroduce a local sandbox `opencode.json` or permission bypass flag.

## Boundaries Kept

The sandbox directory remains `hyperframesDir/.tinker-opencode-workspace` for this change. Renaming it would touch tests, logs, and cleanup behavior without being necessary for agent selection.

Repository snapshot filtering remains unchanged. Sensitive and heavy paths such as `.env*`, `.git`, `node_modules`, `.ssh`, `.aws`, caches, logs, symlinks, and prior `.tinker-opencode-*` files stay excluded from `repository/`.

Generated output copying remains unchanged. The agent writes Hyperframes output files inside the sandbox root, and Tinker copies allowed generated files back to `hyperframesDir` after a successful run.

Environment sanitization remains unchanged. The spawned agent receives only the existing allowlist of host environment variables. This means `OPENCODE_CONFIG`, arbitrary `TINKER_*` secrets, and other host variables are not passed through. If Claude authentication later requires a specific additional variable, that should be a separate explicit design decision.

The JSON prompts remain unchanged except for any wording that must avoid naming the selected agent. Existing output-boundary instructions still apply: source evidence is under `repository/`, generated files belong in the working directory root, and `repository/` is read-only source evidence.

## Error Handling

Timeout behavior remains controlled by `TINKER_HYPERFRAMES_OPENCODE_TIMEOUT_MS` for this change to avoid expanding configuration scope. Error messages should use the selected agent label, such as `OpenCode Hyperframes generation failed...` or `Claude Code Hyperframes generation failed...`, while preserving the existing stderr log path guidance.

Unknown `TINKER_HYPERFRAMES_AGENT` values fail before spawning a process with a message that lists the supported values.

## Tests

Update `packages/demo-assembly/src/hyperframesPlanning.test.ts` to keep the existing OpenCode integration coverage and add Claude selection coverage.

OpenCode assertions:

- Default selection invokes the fake `opencode` executable.
- Arguments still include `run`, `--pure`, `--format`, `json`, `--dir`, and the sandbox path.
- Arguments do not include permission bypass flags.
- No local sandbox `opencode.json` is written.

Claude assertions:

- `TINKER_HYPERFRAMES_AGENT=claude` invokes the fake `claude` executable.
- Arguments include `-p`, the prompt, `--output-format`, and `text`.
- Arguments do not include `--permission-mode`, `--dangerously-skip-permissions`, or `--allow-dangerously-skip-permissions`.
- The fake Claude executable can write `index.html`, `asset-manifest.json`, and `generation-manifest.json` in the sandbox root, and Tinker copies them back to `hyperframesDir`.
- Env sanitization and sandbox cleanup still hold.

Invalid selection assertions:

- An unsupported `TINKER_HYPERFRAMES_AGENT` value rejects with a clear supported-values error and does not spawn an agent.

Existing focused verification remains:

```sh
pnpm --filter @tinker/generation-contract build && pnpm --filter @tinker/project-schema build && pnpm --filter @tinker/browser-capture build && pnpm --filter @tinker/product-analysis build && pnpm --filter @tinker/demo-assembly exec tsx src/hyperframesPlanning.test.ts
```

Final verification remains:

```sh
pnpm --filter @tinker/demo-assembly typecheck
pnpm --filter @tinker/demo-assembly test
```

## Self-Review

The design keeps the feature focused on Hyperframes agent selection only. It does not change planner agent selection, renderer behavior, sandbox naming, authentication env policy, or permission modes.

The selected-agent behavior is explicit: env var only, default OpenCode, inherited permissions, and clear failure for unsupported values.

The implementation boundary is small: factor command construction out of the existing runner lifecycle instead of duplicating the runner for Claude Code.
