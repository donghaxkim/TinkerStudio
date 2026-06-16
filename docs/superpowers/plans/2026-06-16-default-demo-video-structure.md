# Default Demo Video Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated demo videos default to `Hook -> Demo: Use Case -> End Result -> CTA` while preserving user-edited outlines.

**Architecture:** This is a prompt-level behavior change only. Add a shared textual default narrative instruction to the Hyperframes planning prompts, keep Hyperframes generation anchored to the approved outline instead of re-applying the default, and add the same default arc plus beat mapping to both AI URL planner prompts.

**Tech Stack:** TypeScript, Vitest for `apps/api`, `tsx` assertion tests for `packages/demo-assembly`, pnpm workspace filters.

---

## File Structure

- Modify: `apps/api/src/planning/claudePlanningAgent.ts`
  - Owns Claude planning prompt construction for initial and follow-up Hyperframes planning turns.
  - Add default narrative guidance to the initial prompt and user-override guidance to follow-up prompts.
- Modify: `apps/api/src/planning/claudePlanningAgent.test.ts`
  - Verifies the initial planning prompt includes the default arc and the follow-up prompt explicitly allows user-requested structure changes.
- Modify: `packages/demo-assembly/src/hyperframesPlanning.ts`
  - Owns the Hyperframes generation prompt after planning approval.
  - Strengthen approved outline preservation and explicitly forbid forcing the default arc after approval.
- Modify: `packages/demo-assembly/src/hyperframesPlanning.test.ts`
  - Verifies the generation prompt preserves the approved outline and does not re-force the default arc.
- Modify: `packages/demo-assembly/src/aiPlanning.ts`
  - Owns direct and OpenCode AI URL storyboard/capture planner prompts.
  - Add the default arc and beat mapping to both prompt builders.
- Modify: `packages/demo-assembly/src/aiPlanning.test.ts`
  - Verifies direct and OpenCode AI URL prompts include the default arc, mapping, and use-case/end-result capture guidance.

## Task 1: Hyperframes Planning Prompt Default Arc

**Files:**
- Modify: `apps/api/src/planning/claudePlanningAgent.test.ts`
- Modify: `apps/api/src/planning/claudePlanningAgent.ts`

- [ ] **Step 1: Write failing tests for initial and follow-up planning prompts**

In `apps/api/src/planning/claudePlanningAgent.test.ts`, extend the existing initial planning prompt assertions around the current `expect(promptJson).toContain("Do not write Hyperframes project files during planning.");` block with these assertions:

```ts
    expect(promptJson).toContain("Hook -> Demo: Use Case -> End Result -> CTA");
    expect(promptJson).toContain("Use this as the starting recommendation, not a hard constraint.");
    expect(promptJson).toContain("Do not require exactly four scenes");
```

In the existing follow-up test at the end of the file, after `expect(JSON.stringify(prompt)).toContain("Make it more technical.");`, add:

```ts
    const followupPromptJson = JSON.stringify(prompt);
    expect(followupPromptJson).toContain("preserve Hook -> Demo: Use Case -> End Result -> CTA unless the user asks for a different narrative structure");
    expect(followupPromptJson).toContain("If the user asks to change the structure, update outline.json to match the user's requested structure.");
```

- [ ] **Step 2: Run the targeted API test to verify it fails**

Run:

```bash
pnpm --filter @tinker/api test -- src/planning/claudePlanningAgent.test.ts
```

Expected: FAIL because the new prompt strings are not present.

- [ ] **Step 3: Add the default narrative guidance to the planning prompt source**

In `apps/api/src/planning/claudePlanningAgent.ts`, add these constants after `outlineSchema` and before `planningInstructions`:

```ts
const defaultDemoStructure = {
  arc: "Hook -> Demo: Use Case -> End Result -> CTA",
  scenes: [
    { section: "Hook", purpose: "Open with the user problem, product promise, or highest-value outcome." },
    { section: "Demo: Use Case", purpose: "Show a concrete product workflow or use case with real UI evidence." },
    { section: "End Result", purpose: "Reveal the completed state, proof, output, or measurable result." },
    { section: "CTA", purpose: "Close with the next action the viewer should take." },
  ],
  planningRule: "Use this as the starting recommendation, not a hard constraint. Do not require exactly four scenes; users may delete, reorder, rename, or replace sections during planning.",
};

const initialPlanningNarrativeInstructions = [
  `Draft outline.json with the default narrative arc: ${defaultDemoStructure.arc}.`,
  defaultDemoStructure.planningRule,
];

const followupPlanningNarrativeInstructions = [
  `For follow-up turns, preserve ${defaultDemoStructure.arc} unless the user asks for a different narrative structure.`,
  "If the user asks to change the structure, update outline.json to match the user's requested structure.",
];
```

Then update `buildInitialPrompt` to include the new structure and initial instructions:

```ts
export function buildInitialPrompt(input: InitialPlanningAgentTurnInput, websiteAnalysis: ProductAnalysis, repoAnalysis: RepoAnalysis) {
  const { repoCheckoutDirectory } = pathsForWorkspace(input.workspaceRoot);
  return JSON.stringify(
    {
      task: "Plan a Hyperframes product demo by maintaining the demo outline only.",
      instructions: [...planningInstructions, ...initialPlanningNarrativeInstructions],
      safetyInstructions: planningInstructions,
      productUrl: input.productUrl,
      repoUrl: input.repoUrl,
      repositoryDirectory: repoCheckoutDirectory,
      outlinePath: input.outlinePath,
      outlineSchema,
      defaultDemoStructure,
      websiteAnalysis,
      repoAnalysis,
    },
    null,
    2,
  );
}
```

Then update `buildFollowupPrompt` to include the follow-up narrative instructions and structure reference:

```ts
export function buildFollowupPrompt(input: FollowupPlanningAgentTurnInput) {
  return JSON.stringify(
    {
      task: "Continue planning the Hyperframes product demo by updating outline.json when needed.",
      instructions: [...planningInstructions, ...followupPlanningNarrativeInstructions],
      defaultDemoStructure,
      userMessage: input.message,
      outlinePath: input.outlinePath,
    },
    null,
    2,
  );
}
```

- [ ] **Step 4: Run the targeted API test to verify it passes**

Run:

```bash
pnpm --filter @tinker/api test -- src/planning/claudePlanningAgent.test.ts
```

Expected: PASS for `claudePlanningAgent.test.ts`.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add apps/api/src/planning/claudePlanningAgent.ts apps/api/src/planning/claudePlanningAgent.test.ts
git commit -m "feat(api): default hyperframes planning narrative"
```

## Task 2: Hyperframes Generation Preserves Approved Outline

**Files:**
- Modify: `packages/demo-assembly/src/hyperframesPlanning.test.ts`
- Modify: `packages/demo-assembly/src/hyperframesPlanning.ts`

- [ ] **Step 1: Write the failing generation prompt test**

In `packages/demo-assembly/src/hyperframesPlanning.test.ts`, replace the existing assertion:

```ts
assert.match(generatePrompt.instructions.join("\n"), /If approvedDemoBrief contains a JSON outline/);
```

with these assertions:

```ts
const generateInstructions = generatePrompt.instructions.join("\n");
assert.match(generateInstructions, /If approvedDemoBrief contains a JSON outline/);
assert.match(generateInstructions, /Preserve the approved outline's structure/);
assert.match(generateInstructions, /Do not force Hook -> Demo: Use Case -> End Result -> CTA/);
assert.match(generateInstructions, /title, scene goals, pacing, and generation notes/);
```

- [ ] **Step 2: Run the targeted Hyperframes planning test to verify it fails**

Run:

```bash
pnpm --filter @tinker/demo-assembly exec tsx src/hyperframesPlanning.test.ts
```

Expected: FAIL because the generation prompt does not yet explicitly say not to force the default arc after approval.

- [ ] **Step 3: Update the generation prompt instruction**

In `packages/demo-assembly/src/hyperframesPlanning.ts`, in `buildGeneratePrompt`, replace this instruction:

```ts
        "If approvedDemoBrief contains a JSON outline, treat it as the approved structure for title, scene goals, pacing, and generation notes. Preserve that intent unless it conflicts with safety or output requirements.",
```

with this instruction:

```ts
        "If approvedDemoBrief contains a JSON outline, treat it as the approved structure for title, scene goals, pacing, and generation notes. Preserve the approved outline's structure unless it conflicts with safety or output requirements. Do not force Hook -> Demo: Use Case -> End Result -> CTA if the approved outline uses a different user-requested structure.",
```

- [ ] **Step 4: Run the targeted Hyperframes planning test to verify it passes**

Run:

```bash
pnpm --filter @tinker/demo-assembly exec tsx src/hyperframesPlanning.test.ts
```

Expected: PASS for `hyperframesPlanning.test.ts`.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add packages/demo-assembly/src/hyperframesPlanning.ts packages/demo-assembly/src/hyperframesPlanning.test.ts
git commit -m "feat(hyperframes): preserve approved narrative structure"
```

## Task 3: AI URL Storyboard Default Arc

**Files:**
- Modify: `packages/demo-assembly/src/aiPlanning.test.ts`
- Modify: `packages/demo-assembly/src/aiPlanning.ts`

- [ ] **Step 1: Write failing direct planner prompt assertions**

In `packages/demo-assembly/src/aiPlanning.test.ts`, after the existing direct planner assertions around `assert.match(directPrompt, /Prefer actions supported by visible website analysis/);`, add:

```ts
assert.match(directPrompt, /Hook -> Demo: Use Case -> End Result -> CTA/);
assert.match(directPrompt, /Hook maps to hook/);
assert.match(directPrompt, /Demo: Use Case maps to screen_capture or feature/);
assert.match(directPrompt, /End Result maps to proof/);
assert.match(directPrompt, /CTA maps to cta/);
assert.match(directPrompt, /prioritize product actions that support the use case and reveal the end result/);
```

- [ ] **Step 2: Write failing OpenCode planner prompt assertions**

In `packages/demo-assembly/src/aiPlanning.test.ts`, after `assert.match(opencodeCalls[0]?.prompt ?? "", /Generate highlight reels/);`, add:

```ts
assert.match(opencodeCalls[0]?.prompt ?? "", /Hook -> Demo: Use Case -> End Result -> CTA/);
assert.match(opencodeCalls[0]?.prompt ?? "", /Hook maps to hook/);
assert.match(opencodeCalls[0]?.prompt ?? "", /Demo: Use Case maps to screen_capture or feature/);
assert.match(opencodeCalls[0]?.prompt ?? "", /End Result maps to proof/);
assert.match(opencodeCalls[0]?.prompt ?? "", /CTA maps to cta/);
assert.match(opencodeCalls[0]?.prompt ?? "", /prioritize product actions that support the use case and reveal the end result/);
```

- [ ] **Step 3: Run the targeted AI planning test to verify it fails**

Run:

```bash
pnpm --filter @tinker/demo-assembly exec tsx src/aiPlanning.test.ts
```

Expected: FAIL because the AI URL planner prompts do not yet include the default arc or beat mapping.

- [ ] **Step 4: Add shared AI URL default narrative instructions**

In `packages/demo-assembly/src/aiPlanning.ts`, add this constant before `buildPlannerPrompt`:

```ts
const defaultStoryboardNarrativeInstructions = [
  "Use Hook -> Demo: Use Case -> End Result -> CTA as the default storyboard arc.",
  "Beat mapping: Hook maps to hook; Demo: Use Case maps to screen_capture or feature; End Result maps to proof; CTA maps to cta.",
  "The capture plan should prioritize product actions that support the use case and reveal the end result, rather than producing a generic homepage tour.",
];
```

Then add the shared instructions to the direct planner `instructions` array in `buildPlannerPrompt` immediately after the existing safety/action instructions and before the repo-analysis conditional spread:

```ts
        ...defaultStoryboardNarrativeInstructions,
```

The beginning of that `instructions` array should become:

```ts
      instructions: [
        "Return one JSON object only.",
        "Use exactly the top-level keys storyboard and capturePlan.",
        "Do not include schema, scenes, captions, audio, style, metadata, or editableTextFields.",
        "Prefer simple visible UI actions and avoid auth, payments, destructive actions, or external navigation.",
        "Do not type into inputs unless the user prompt provides a safe value; for external websites prefer goto, wait, hover, scroll, and pause.",
        ...defaultStoryboardNarrativeInstructions,
        ...(repoAnalysis
          ? [
```

Then add the same shared instructions to the OpenCode planner `instructions` array in `buildOpencodePlannerPrompt` after the deterministic capture instruction and before the URL-input form submission instruction:

```ts
        ...defaultStoryboardNarrativeInstructions,
```

The relevant part should become:

```ts
        "Do not navigate outside the final analyzed productUrl origin. External URLs may be typed into product inputs only when they are the sample content being demonstrated.",
        "Keep the capture deterministic: use goto, waitForSelector, click, type, press, scroll, hover, and pause only.",
        ...defaultStoryboardNarrativeInstructions,
        "For URL-input form submission after typing sample input, prefer a press step with key Enter on the input instead of clicking button text.",
```

- [ ] **Step 5: Run the targeted AI planning test to verify it passes**

Run:

```bash
pnpm --filter @tinker/demo-assembly exec tsx src/aiPlanning.test.ts
```

Expected: PASS for `aiPlanning.test.ts`.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add packages/demo-assembly/src/aiPlanning.ts packages/demo-assembly/src/aiPlanning.test.ts
git commit -m "feat(demo-assembly): default ai url storyboard arc"
```

## Task 4: Final Verification

**Files:**
- Verify only; no planned file edits.

- [ ] **Step 1: Run package tests for changed packages**

Run:

```bash
pnpm --filter @tinker/api test
pnpm --filter @tinker/demo-assembly test
```

Expected: both commands exit 0.

- [ ] **Step 2: Run package typechecks for changed packages**

Run:

```bash
pnpm --filter @tinker/api typecheck
pnpm --filter @tinker/demo-assembly typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat HEAD~3..HEAD
git diff HEAD~3..HEAD -- apps/api/src/planning/claudePlanningAgent.ts apps/api/src/planning/claudePlanningAgent.test.ts packages/demo-assembly/src/hyperframesPlanning.ts packages/demo-assembly/src/hyperframesPlanning.test.ts packages/demo-assembly/src/aiPlanning.ts packages/demo-assembly/src/aiPlanning.test.ts
```

Expected: only the planned prompt and prompt-test changes are present, plus any unrelated pre-existing untracked files remain unstaged.

- [ ] **Step 4: Commit verification-only changes if needed**

If Task 4 required no edits, skip this step. If a small correction was made during verification, run:

```bash
git add apps/api/src/planning/claudePlanningAgent.ts apps/api/src/planning/claudePlanningAgent.test.ts packages/demo-assembly/src/hyperframesPlanning.ts packages/demo-assembly/src/hyperframesPlanning.test.ts packages/demo-assembly/src/aiPlanning.ts packages/demo-assembly/src/aiPlanning.test.ts
git commit -m "fix: align default demo structure prompts"
```

Expected: any final correction is isolated to the files listed above.

## Spec Coverage Checklist

- Hyperframes initial planning prompt includes default structure: Task 1.
- Hyperframes default is a starting recommendation, not a hard constraint: Task 1.
- Follow-up planning preserves the default unless the user asks for another structure: Task 1.
- User-requested structure changes override the default: Task 1.
- Hyperframes generation preserves approved outline structure and does not re-force the default: Task 2.
- Playwright/AI URL planning uses the same default arc: Task 3.
- Beat mapping uses `hook`, `screen_capture` or `feature`, `proof`, and `cta`: Task 3.
- Capture plan prioritizes use-case and end-result actions over generic homepage tours: Task 3.
- No schema change and no four-scene lock: Tasks 1-3 avoid schema edits and only change prompt text.

## Rollback Plan

- Revert Task 3 commit to remove AI URL default arc behavior while leaving Hyperframes behavior in place.
- Revert Task 2 commit to remove generation-prompt preservation wording if it causes prompt regressions.
- Revert Task 1 commit to remove Hyperframes planning default arc behavior.
