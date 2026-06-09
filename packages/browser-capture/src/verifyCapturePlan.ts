import { CaptureError, type CapturePlan, type CaptureStep, type VerifyCapturePlanIssue, type VerifyCapturePlanResult } from "./types.js";

export const MAX_SELECTOR_TIMEOUT_MS = 10_000;
export const MAX_PAUSE_MS = 5_000;
export const MAX_CAPTURE_STEPS = 50;
export const MAX_CAPTURE_CHECKPOINTS = 20;

function isPositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function hasText(value: string | undefined) {
  return value !== undefined && value.trim().length > 0;
}

function isHttpUrl(value: string | undefined) {
  const text = value?.trim();
  if (text === undefined || text.length === 0) {
    return false;
  }

  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function addIssue(issues: VerifyCapturePlanIssue[], path: string, message: string) {
  issues.push({ path, message });
}

function verifyStep(step: CaptureStep, index: number, issues: VerifyCapturePlanIssue[]) {
  const path = `steps.${index}`;

  switch (step.type) {
    case "goto":
      if (!hasText(step.url)) {
        addIssue(issues, `${path}.url`, "goto step requires url");
      } else if (!isHttpUrl(step.url)) {
        addIssue(issues, `${path}.url`, "goto url must be an http or https URL");
      }
      return;
    case "click":
      if (!hasText(step.selector) && !hasText(step.text)) {
        addIssue(issues, path, "click step requires selector or text");
      }
      return;
    case "type":
      if (!hasText(step.selector)) {
        addIssue(issues, `${path}.selector`, "type step requires selector");
      }
      if (!hasText(step.text)) {
        addIssue(issues, `${path}.text`, "type step requires text");
      }
      return;
    case "scroll":
      if (step.x === undefined && step.y === undefined && !hasText(step.selector)) {
        addIssue(issues, path, "scroll step requires x, y, or selector");
      }
      if (step.x !== undefined && !isFiniteNumber(step.x)) {
        addIssue(issues, `${path}.x`, "scroll x must be finite");
      }
      if (step.y !== undefined && !isFiniteNumber(step.y)) {
        addIssue(issues, `${path}.y`, "scroll y must be finite");
      }
      return;
    case "hover":
      if (!hasText(step.selector) && !hasText(step.text)) {
        addIssue(issues, path, "hover step requires selector or text");
      }
      return;
    case "waitForSelector":
      if (!hasText(step.selector)) {
        addIssue(issues, `${path}.selector`, "waitForSelector step requires selector");
      }
      if (step.timeoutMs !== undefined && !isPositiveNumber(step.timeoutMs)) {
        addIssue(issues, `${path}.timeoutMs`, "timeoutMs must be positive");
      }
      if (step.timeoutMs !== undefined && step.timeoutMs > MAX_SELECTOR_TIMEOUT_MS) {
        addIssue(issues, `${path}.timeoutMs`, `timeoutMs must be at most ${MAX_SELECTOR_TIMEOUT_MS}`);
      }
      return;
    case "pause":
      if (!isNonNegativeNumber(step.ms)) {
        addIssue(issues, `${path}.ms`, "pause ms must be nonnegative");
      }
      if (step.ms > MAX_PAUSE_MS) {
        addIssue(issues, `${path}.ms`, `pause ms must be at most ${MAX_PAUSE_MS}`);
      }
      return;
  }

  const unknownStep = step as { type?: unknown };
  addIssue(issues, `${path}.type`, `unknown step type '${String(unknownStep.type)}'`);
}

export function verifyCapturePlan(plan: CapturePlan): VerifyCapturePlanResult {
  const issues: VerifyCapturePlanIssue[] = [];

  if (!hasText(plan.targetUrl)) {
    addIssue(issues, "targetUrl", "targetUrl is required");
  } else if (!isHttpUrl(plan.targetUrl)) {
    addIssue(issues, "targetUrl", "targetUrl must be an http or https URL");
  }

  if (!isPositiveNumber(plan.viewport.width)) {
    addIssue(issues, "viewport.width", "viewport width must be positive");
  }

  if (!isPositiveNumber(plan.viewport.height)) {
    addIssue(issues, "viewport.height", "viewport height must be positive");
  }

  if (plan.steps.length === 0) {
    addIssue(issues, "steps", "at least one capture step is required");
  }

  if (plan.steps.length > MAX_CAPTURE_STEPS) {
    addIssue(issues, "steps", `capture plan must have at most ${MAX_CAPTURE_STEPS} steps`);
  }

  if (plan.expectedCheckpoints.length > MAX_CAPTURE_CHECKPOINTS) {
    addIssue(
      issues,
      "expectedCheckpoints",
      `capture plan must have at most ${MAX_CAPTURE_CHECKPOINTS} expected checkpoints`,
    );
  }

  plan.steps.slice(0, MAX_CAPTURE_STEPS).forEach((step, index) => verifyStep(step, index, issues));

  plan.expectedCheckpoints.slice(0, MAX_CAPTURE_CHECKPOINTS).forEach((checkpoint, index) => {
    const path = `expectedCheckpoints.${index}`;
    if (!hasText(checkpoint.id)) {
      addIssue(issues, `${path}.id`, "checkpoint id is required");
    }
    if (!hasText(checkpoint.label)) {
      addIssue(issues, `${path}.label`, "checkpoint label is required");
    }
    if (!hasText(checkpoint.selector) && !hasText(checkpoint.text)) {
      addIssue(issues, path, "checkpoint requires selector or text");
    }
  });

  return { valid: issues.length === 0, issues };
}

export function assertValidCapturePlan(plan: CapturePlan) {
  const result = verifyCapturePlan(plan);

  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new CaptureError(`Invalid capture plan: ${details}`);
  }
}
