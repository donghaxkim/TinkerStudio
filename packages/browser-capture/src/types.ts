import type { ActionTrace } from "./actionTrace.js";

export type CaptureStep =
  | { type: "goto"; url: string }
  | { type: "click"; selector?: string; text?: string; label?: string }
  | { type: "type"; selector: string; text: string }
  | { type: "press"; selector: string; key: string }
  | { type: "scroll"; x?: number; y?: number; selector?: string }
  | { type: "hover"; selector?: string; text?: string }
  | { type: "waitForSelector"; selector: string; timeoutMs?: number }
  | { type: "pause"; ms: number };

export type Checkpoint = {
  id: string;
  label: string;
  selector?: string;
  text?: string;
};

export type CheckpointResult = Checkpoint & {
  passed: boolean;
  message?: string;
};

export type CapturePlan = {
  targetUrl: string;
  viewport: { width: number; height: number };
  steps: CaptureStep[];
  expectedCheckpoints: Checkpoint[];
};

export type CaptureAsset = {
  id: string;
  type: "video" | "image" | "trace" | "json";
  uri: string;
  source: "captured";
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
};

export type CaptureEvent =
  | { time: number; type: "click"; x: number; y: number; label?: string }
  | { time: number; type: "cursor"; x: number; y: number }
  | { time: number; type: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | {
      time: number;
      type: "zoomTarget";
      x: number;
      y: number;
      width: number;
      height: number;
      label?: string;
    };

export type CaptureResult = {
  clips: CaptureAsset[];
  screenshots: CaptureAsset[];
  events: CaptureEvent[];
  /** Structured per-action trace (populated when capture runs with `smooth`/tracing). */
  actionTrace?: ActionTrace;
  tracePath?: string;
  checkpoints: CheckpointResult[];
  metadata: {
    startedAt: string;
    completedAt: string;
    targetUrl: string;
    viewport: { width: number; height: number };
  };
};

export type VerifyCapturePlanIssue = {
  path: string;
  message: string;
};

export type VerifyCapturePlanResult = {
  valid: boolean;
  issues: VerifyCapturePlanIssue[];
};

export class CaptureError extends Error {
  readonly stepIndex?: number;

  constructor(message: string, stepIndex?: number) {
    super(message);
    this.name = "CaptureError";
    this.stepIndex = stepIndex;
  }
}
