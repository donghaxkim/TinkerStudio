# Hyperframes OpenCode Permissions Design

## Goal

Hyperframes project generation should spawn OpenCode without a Hyperframes-specific permission policy. The spawned OpenCode process should use its normal default/global permission behavior instead of a locally generated sandbox `opencode.json` that denies tools.

## Current Behavior

`packages/demo-assembly/src/hyperframesPlanning.ts` prepares a temporary OpenCode workspace under `hyperframesDir/.tinker-opencode-workspace`. During setup, it writes `opencode.json` in that workspace with these permissions:

```json
{
  "permission": {
    "edit": "allow",
    "bash": "deny",
    "webfetch": "deny",
    "external_directory": "deny"
  }
}
```

The generated local config overrides normal OpenCode behavior for Hyperframes generation and repair.

## Approved Design

Remove the Hyperframes-specific local OpenCode config creation. `prepareOpencodeSandbox()` should continue to create the sandbox, copy the repository snapshot, copy prior generated output, and run OpenCode inside the sandbox, but it should not write `opencode.json`.

The spawn command remains:

```sh
opencode run --pure --format json --dir <sandbox> <prompt>
```

No `--model` or permission flags are added. OpenCode resolves permissions from its normal behavior.

## Boundaries Kept

The change does not alter repository snapshot filtering. Sensitive and heavy paths remain excluded from the copied `repository/` snapshot.

The change does not alter generated output copying. Hyperframes still copies generated files from the sandbox back to `hyperframesDir` and cleans up the temporary workspace.

The change does not alter the renderer. Actual video rendering still runs through the Hyperframes CLI after OpenCode generates or repairs project files.

## Tests

Update Hyperframes planning tests that currently assert the sandbox config exists and denies permissions. The replacement assertion should confirm the generated output no longer includes `opencode.json` from the Hyperframes sandbox setup.

Existing tests should continue to cover sandbox cleanup, repository snapshot filtering, stdout/stderr logging, and artifact validation.
