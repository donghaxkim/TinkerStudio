// Director Plan (Director Mode, first pass)
//
// Turns the pipeline's understanding/strategy/storyboard + the captured action trace,
// render plan and screenshots into `director-plan.json`: a shot list that says how the
// final video should be cut and framed, plus cursor-visibility guidance and dead-time
// compression decisions.
//
// Deterministic, and targeted at landing-page / library-showcase pages (PayKit-style):
// it detects hero / code / terminal-init / UI-result / CTA signals across the artifacts
// and emits a canonical showcase sequence. Interaction-heavy app flows fall back to a
// recording-sourced result shot. No autonomous agent, no Remotion.

import type { ActionTrace, ActionTraceEntry, BoundingBox, CapturePlan, RenderPlan } from "@tinker/browser-capture";
import { z } from "zod";
import type { DemoStrategy, Storyboard } from "./demoStrategy.js";
import type { ProductUnderstanding } from "./productUnderstanding.js";
import { buildEditDecisionList, type EditDecisionList } from "./editDecisionList.js";

export const ShotKindSchema = z.enum(["hero", "code", "terminal", "result", "cta", "interaction", "overview"]);
export const ShotSourceSchema = z.enum(["recording", "screenshot", "full-page-screenshot"]);
export const ShotMotionSchema = z.enum(["static", "push-in", "zoom-in", "zoom-out", "pan"]);

const RegionSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict();

export const DirectorShotSchema = z
  .object({
    id: z.string(),
    kind: ShotKindSchema,
    start: z.number(),
    end: z.number(),
    source: ShotSourceSchema,
    region: RegionSchema.optional(),
    motion: ShotMotionSchema,
    caption: z.string(),
    reason: z.string(),
    showCursor: z.boolean(),
    beatId: z.string().optional(),
  })
  .strict();

export const DirectorPlanSchema = z
  .object({
    version: z.literal(1),
    page: z.object({ kind: z.enum(["landing-showcase", "app-flow", "unknown"]), title: z.string() }).strict(),
    shots: z.array(DirectorShotSchema).min(1),
    cursor: z
      .object({ defaultVisible: z.boolean(), hideDuringKinds: z.array(ShotKindSchema), notes: z.string() })
      .strict(),
    deadTime: z
      .object({
        gapThresholdSeconds: z.number(),
        sourceDurationSeconds: z.number(),
        compressedDurationSeconds: z.number(),
        removedSeconds: z.number(),
        decisions: z.array(z.string()),
      })
      .strict(),
    notes: z.array(z.string()),
  })
  .strict();

export type DirectorShot = z.infer<typeof DirectorShotSchema>;
export type DirectorPlan = z.infer<typeof DirectorPlanSchema>;
export type ShotKind = z.infer<typeof ShotKindSchema>;

export type DirectorScreenshots = {
  fullPagePath?: string;
  finalPath?: string;
  actionShots?: Array<{ label: string; path: string }>;
};

export type BuildDirectorPlanInput = {
  productUnderstanding: ProductUnderstanding;
  demoStrategy: DemoStrategy;
  storyboard: Storyboard;
  capturePlan: CapturePlan;
  actionTrace: ActionTrace;
  renderPlan: RenderPlan;
  editDecisionList?: EditDecisionList;
  screenshots?: DirectorScreenshots;
  viewport: { width: number; height: number };
};

const CODE_SIGNAL = /\b(code|products?\.ts|\.ts\b|\.tsx\b|\.js\b|sdk|schema|config|import |export |const |function|api\b|snippet|define[sd]?)\b/i;
const TERMINAL_SIGNAL = /\b(npx|npm|pnpm|yarn|bunx?|install|init|cli|terminal|command|\$\s)\b/i;
const RESULT_SIGNAL = /\b(upgrade|billing|dashboard|result|manage|pricing|plan|free|pro|preview|output|generated|checkout|portal|ui)\b/i;
const CTA_SIGNAL = /\b(ready to|get started|try (it|now)|sign ?up|start (now|free|building)|add billing|book a demo)\b/i;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Collect a deduped text corpus from every upstream artifact for signal detection. */
function collectCorpus(input: BuildDirectorPlanInput): string[] {
  const { productUnderstanding: u, demoStrategy: s, storyboard, capturePlan, actionTrace } = input;
  const out: string[] = [
    u.product.name,
    u.product.oneLine,
    u.product.primaryValueProposition,
    u.product.category,
    s.selectedAngle.title,
    s.selectedAngle.primaryProof,
    s.selectedFlow.name,
    ...s.messageHierarchy,
    ...u.capabilities.flatMap((c) => [c.name, c.description]),
    ...u.demoableFlows.flatMap((f) => [f.name, f.expectedOutcome]),
    ...u.evidence.map((e) => `${e.claim} ${e.quoteOrReference}`),
    ...storyboard.beats.flatMap((b) => [b.goal, b.narrative, b.visual]),
    capturePlan.targetUrl,
    ...capturePlan.steps.flatMap((step) => [
      "text" in step && step.text ? step.text : "",
      "selector" in step && step.selector ? step.selector : "",
    ]),
    ...actionTrace.actions.flatMap((a) => [a.description ?? "", a.text ?? "", a.selector ?? ""]),
  ];
  return [...new Set(out.map((t) => t.trim()).filter((t) => t.length > 0))];
}

/** First corpus entry matching `pattern`, else `fallback`. Keeps captions grounded in real text. */
function pickCaption(corpus: string[], pattern: RegExp, fallback: string): string {
  const hit = corpus.find((text) => pattern.test(text));
  return (hit ?? fallback).slice(0, 140);
}

function interactionEntries(trace: ActionTrace): ActionTraceEntry[] {
  return trace.actions.filter((a) => a.type === "click" || a.type === "type");
}

function strongestBox(trace: ActionTrace): BoundingBox | undefined {
  return interactionEntries(trace)
    .map((a) => a.targetBox)
    .filter((box): box is BoundingBox => box !== undefined)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/** A ~60%-of-viewport crop centered on a normalized (0..1) render-plan focus point. */
function regionFromFocus(focus: { x: number; y: number }, viewport: { width: number; height: number }): BoundingBox {
  const width = viewport.width * 0.6;
  const height = viewport.height * 0.6;
  return {
    x: round(Math.max(0, focus.x * viewport.width - width / 2)),
    y: round(Math.max(0, focus.y * viewport.height - height / 2)),
    width: round(width),
    height: round(height),
  };
}

type PlannedShot = Omit<DirectorShot, "start" | "end">;

/** Distribute planned shots across the storyboard duration, weighted by kind. */
function withTiming(shots: PlannedShot[], durationSeconds: number): DirectorShot[] {
  const weightOf = (kind: ShotKind): number =>
    kind === "result" || kind === "interaction" ? 3 : kind === "code" || kind === "terminal" ? 2 : 1.4;
  const weights = shots.map((shot) => weightOf(shot.kind));
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  let cursor = 0;
  return shots.map((shot, index) => {
    const start = round((cursor / total) * durationSeconds);
    cursor += weights[index];
    const end = round(Math.min((cursor / total) * durationSeconds, durationSeconds));
    return { ...shot, start, end };
  });
}

export function buildDirectorPlan(input: BuildDirectorPlanInput): DirectorPlan {
  const corpus = collectCorpus(input);
  const joined = corpus.join(" • ");
  const hasCode = CODE_SIGNAL.test(joined);
  const hasTerminal = TERMINAL_SIGNAL.test(joined);
  const interactions = interactionEntries(input.actionTrace);

  const pageKind: DirectorPlan["page"]["kind"] =
    interactions.length <= 2 || hasCode || hasTerminal ? "landing-showcase" : "app-flow";

  const headline = [input.productUnderstanding.product.primaryValueProposition, input.demoStrategy.selectedAngle.primaryProof, input.productUnderstanding.product.oneLine]
    .map((t) => t.trim())
    .find((t) => t.length > 0) ?? input.productUnderstanding.product.name;

  const lastBeat = input.storyboard.beats[input.storyboard.beats.length - 1];
  const fullPageSource: DirectorShot["source"] = input.screenshots?.fullPagePath ? "full-page-screenshot" : "screenshot";

  const planned: PlannedShot[] = [];

  // 1. Hero — always. The headline, framed on the landing/hero state.
  planned.push({
    id: "shot-hero",
    kind: "hero",
    source: fullPageSource,
    motion: "push-in",
    caption: headline,
    reason: "Open on the product's headline value proposition.",
    showCursor: false,
    beatId: input.storyboard.beats[0]?.id,
  });

  // 2. Code panel — when the product is code/SDK-defined.
  if (hasCode) {
    planned.push({
      id: "shot-code",
      kind: "code",
      source: "screenshot",
      motion: "zoom-in",
      caption: pickCaption(corpus, CODE_SIGNAL, "How it's defined in code"),
      reason: "Code/SDK signals detected — show the definition.",
      showCursor: false,
    });
  }

  // 3. Terminal / init — when there's an install/CLI step.
  if (hasTerminal) {
    planned.push({
      id: "shot-terminal",
      kind: "terminal",
      source: "screenshot",
      motion: "static",
      caption: pickCaption(corpus, TERMINAL_SIGNAL, "Install & initialize"),
      reason: "Install/init signals detected — show the one-command setup.",
      showCursor: false,
    });
  }

  // 4. Result / UI — the proof. Sourced from the recording when there's a real interaction
  // (so the cursor + result are live), otherwise from a screenshot. Framing comes from the
  // interaction box, falling back to the render plan's strongest (non-scroll) camera focus.
  const box = strongestBox(input.actionTrace);
  const cameraFocus = input.renderPlan.zoomSegments.find((segment) => !segment.id.startsWith("scroll"))?.focus;
  const resultRegion = box
    ? { x: box.x, y: box.y, width: box.width, height: box.height }
    : cameraFocus
      ? regionFromFocus(cameraFocus, input.viewport)
      : undefined;
  const isLiveResult = interactions.length > 0;
  planned.push({
    id: "shot-result",
    kind: "result",
    source: isLiveResult ? "recording" : "screenshot",
    motion: "zoom-in",
    caption: pickCaption(corpus, RESULT_SIGNAL, input.demoStrategy.selectedAngle.primaryProof || "The result in the product UI"),
    reason: isLiveResult ? "Show the live product result around the interaction." : "Show the product's result state.",
    showCursor: isLiveResult,
    ...(resultRegion ? { region: resultRegion } : {}),
  });

  // 5. CTA — always close on the call to action.
  planned.push({
    id: "shot-cta",
    kind: "cta",
    source: fullPageSource,
    motion: "static",
    caption: pickCaption(corpus, CTA_SIGNAL, lastBeat?.narrative || `Ready to try ${input.productUnderstanding.product.name}?`),
    reason: "Close on the call to action.",
    showCursor: false,
    beatId: lastBeat?.id,
  });

  const shots = withTiming(planned, input.storyboard.durationTargetSeconds);

  const edl = input.editDecisionList ?? buildEditDecisionList(input.actionTrace);
  const hideDuringKinds: ShotKind[] = ["hero", "code", "terminal", "cta"];

  return DirectorPlanSchema.parse({
    version: 1,
    page: { kind: pageKind, title: input.storyboard.title },
    shots,
    cursor: {
      defaultVisible: isLiveResult,
      hideDuringKinds,
      notes: "Hide the cursor on static showcase shots; show it only where a real interaction drives the result.",
    },
    deadTime: {
      gapThresholdSeconds: edl.gapThresholdSeconds,
      sourceDurationSeconds: edl.sourceDurationSeconds,
      compressedDurationSeconds: edl.compressedDurationSeconds,
      removedSeconds: edl.removedSeconds,
      decisions: edl.cuts.map((cut) => cut.reason),
    },
    notes: [
      `Page treated as ${pageKind}.`,
      `${input.renderPlan.zoomSegments.length} render-plan camera segments available to the compose pass.`,
      "First pass: deterministic shot list for a downstream compose pass; no Remotion / no post-render camera yet.",
    ],
  });
}
