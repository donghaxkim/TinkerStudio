// action-trace module (first pass)
//
// A structured, per-action record of what Playwright did during a capture. The
// existing capture already emits a low-level CaptureEvent stream; this is a higher
// level "what happened, when, where, did it work" trace that the render planner
// reads to decide zooms/holds/effects. Persisted to `action-trace.json`.

import type { CapturePlan, CaptureResult, CaptureStep } from "./types.js";

export type TracedActionType = "navigation" | "click" | "type" | "scroll" | "wait" | "hover" | "press";

export type BoundingBox = { x: number; y: number; width: number; height: number };

export type ActionTraceEntry = {
  /** Stable id, e.g. "click-3". */
  id: string;
  type: TracedActionType;
  /** Human-readable label for the action (button text, step intent, etc.). */
  description?: string;
  selector?: string;
  text?: string;
  /** Seconds since capture start. */
  startTime: number;
  endTime: number;
  /** Target element box in viewport pixels, when the action had a DOM target. */
  targetBox?: BoundingBox;
  /** Where the click/tap landed, in viewport pixels. */
  clickPoint?: { x: number; y: number };
  /** Document scroll offset after the action. */
  scrollPosition?: { x: number; y: number };
  /** Relative paths to screenshots taken just before / after the action. */
  beforeScreenshot?: string;
  afterScreenshot?: string;
  /** Storyboard beat this action contributes to (best-effort lineage; optional). */
  beatId?: string;
  /** Human-readable intent for this action, usually the storyboard beat goal. */
  intent?: string;
  status: "success" | "error";
  error?: string;
};

export type ActionTrace = {
  version: 1;
  targetUrl: string;
  viewport: { width: number; height: number };
  /** Frame rate of the underlying recording, carried forward for the planner. */
  fps: number;
  startedAt: string;
  completedAt: string;
  actions: ActionTraceEntry[];
};

export type ActionTraceRecorderOptions = {
  targetUrl: string;
  viewport: { width: number; height: number };
  fps: number;
  startedAtMs: number;
};

export type ActionTraceRecorder = {
  /** Allocate the next stable id for a given action type. */
  nextId(type: TracedActionType): string;
  /** Seconds elapsed since capture start for a given wall-clock ms (defaults to now). */
  elapsed(nowMs?: number): number;
  record(entry: ActionTraceEntry): ActionTraceEntry;
  readonly actions: ActionTraceEntry[];
  build(completedAtMs?: number): ActionTrace;
};

function secondsSince(startedAtMs: number, nowMs: number): number {
  return Math.round(((nowMs - startedAtMs) / 1_000) * 1_000) / 1_000;
}

export function createActionTraceRecorder(options: ActionTraceRecorderOptions): ActionTraceRecorder {
  const actions: ActionTraceEntry[] = [];
  const counters = new Map<TracedActionType, number>();

  return {
    nextId(type) {
      const next = (counters.get(type) ?? 0) + 1;
      counters.set(type, next);
      return `${type}-${next}`;
    },
    elapsed(nowMs = Date.now()) {
      return secondsSince(options.startedAtMs, nowMs);
    },
    record(entry) {
      actions.push(entry);
      return entry;
    },
    get actions() {
      return actions;
    },
    build(completedAtMs = Date.now()): ActionTrace {
      return {
        version: 1,
        targetUrl: options.targetUrl,
        viewport: options.viewport,
        fps: options.fps,
        startedAt: new Date(options.startedAtMs).toISOString(),
        completedAt: new Date(completedAtMs).toISOString(),
        actions,
      };
    },
  };
}

function stepActionType(step: CaptureStep): TracedActionType {
  switch (step.type) {
    case "goto":
      return "navigation";
    case "click":
      return "click";
    case "type":
      return "type";
    case "scroll":
      return "scroll";
    case "hover":
      return "hover";
    case "press":
      return "press";
    case "waitForSelector":
    case "pause":
      return "wait";
  }
}

/**
 * Fallback trace builder for callers that only have a CaptureResult (e.g. the demo
 * assembler running with a mocked capture, or an older capture without an embedded
 * trace). Maps each plan step to a coarse entry, enriching click timing/position
 * from the low-level event stream when present. First-pass: timing is approximate.
 */
export function deriveActionTraceFromCapture(
  plan: CapturePlan,
  capture: CaptureResult,
  options: { fps?: number } = {},
): ActionTrace {
  const clickEvents = capture.events.filter(
    (event): event is Extract<CaptureResult["events"][number], { type: "click" }> => event.type === "click",
  );
  const scrollEvents = capture.events.filter(
    (event): event is Extract<CaptureResult["events"][number], { type: "scroll" }> => event.type === "scroll",
  );

  const counters = new Map<TracedActionType, number>();
  let clickCursor = 0;
  let scrollCursor = 0;

  const actions: ActionTraceEntry[] = plan.steps.map((step) => {
    const type = stepActionType(step);
    const index = (counters.get(type) ?? 0) + 1;
    counters.set(type, index);

    const entry: ActionTraceEntry = {
      id: `${type}-${index}`,
      type,
      status: "success",
      startTime: 0,
      endTime: 0,
    };

    if ("selector" in step && step.selector) entry.selector = step.selector;
    if ("text" in step && step.text) entry.text = step.text;
    if ("label" in step && step.label) entry.description = step.label;

    if ((type === "click" || type === "type") && clickEvents[clickCursor]) {
      const event = clickEvents[clickCursor];
      clickCursor += 1;
      entry.clickPoint = { x: event.x, y: event.y };
      entry.startTime = event.time;
      entry.endTime = event.time;
      if (event.label && !entry.description) entry.description = event.label;
    }

    if (type === "scroll" && scrollEvents[scrollCursor]) {
      const event = scrollEvents[scrollCursor];
      scrollCursor += 1;
      entry.scrollPosition = { x: event.x, y: event.y };
      entry.startTime = event.time;
      entry.endTime = event.time;
    }

    return entry;
  });

  return {
    version: 1,
    targetUrl: plan.targetUrl,
    viewport: plan.viewport,
    fps: options.fps ?? 25,
    startedAt: capture.metadata.startedAt,
    completedAt: capture.metadata.completedAt,
    actions,
  };
}
