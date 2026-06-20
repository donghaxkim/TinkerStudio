import { collectOpencodeText, defaultRunAiPlannerOpencode, parseJsonObjectsFromText, type AiUrlPlannerOpencodeRun } from "./aiPlanning.js";
import { runClaudeAgent } from "./claudeCodeAgent.js";

export const STRATEGY_FALLBACK_WARNING = "Strategy agent failed; used deterministic strategy.";
import { DemoStrategySchema, StoryboardSchema, deriveDemoStrategy,
  type DemoStrategyResult, type DeriveDemoStrategyInput, type Strategize } from "./demoStrategy.js";

function abortError() {
  return new DOMException("Strategy cancelled.", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw abortError();
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function approvedOutlineContext(input: DeriveDemoStrategyInput) {
  if (input.approvedOutline === undefined) return undefined;
  return {
    title: input.approvedOutline.title,
    durationCapSeconds: input.approvedOutline.durationCapSeconds,
    aspectRatio: input.approvedOutline.aspectRatio,
    summary: input.approvedOutline.summary,
    scenes: input.approvedOutline.scenes.map((scene) => ({
      id: scene.id,
      goal: scene.goal,
      visual: scene.visual,
      narration: scene.narration,
      startHint: scene.startHint,
      endHint: scene.endHint,
      evidence: scene.evidence,
    })),
    generationNotes: input.approvedOutline.generationNotes,
  };
}

export function buildStrategyPrompt(input: DeriveDemoStrategyInput): string {
  return JSON.stringify({
    task: "Design the demo story. Output ONE JSON object with keys strategy and storyboard.",
    systemDirective: input.systemPrompt ?? "",
    instructions: [
      ...(input.systemPrompt ? [`Above all, follow this directive: ${input.systemPrompt}`] : []),
      ...(input.approvedOutline
        ? [
            "Use approvedOutline as the preferred story structure: preserve title, duration, aspect ratio, scene order, scene IDs, goals, visual intent, and generation notes where possible.",
            "If a scene appears unsupported by the product understanding, adapt safely and report the gap in strategy.warnings instead of inventing product behavior.",
          ]
        : []),
      "Open on the PROBLEM and audience from valueNarrative; demo the rank-1 flow; prove it with the flow's expectedOutcome; close on whyItMatters.",
      "Every storyboard beat: set narrative to the viewer-level point (use flow.viewerTakeaway for the proof beat). strategyMessageId references messageHierarchy by 1-based id message-N. proofPointId references a real capability id.",
      "Do not invent product facts beyond the provided understanding.",
      "Output ONLY the JSON object — no prose, no code fences.",
    ],
    approvedOutline: approvedOutlineContext(input),
    understanding: input.understanding,
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
  }, null, 2);
}

export function parseStrategyOutput(raw: string): DemoStrategyResult {
  let lastError: unknown;
  for (const candidate of parseJsonObjectsFromText(raw).reverse()) {
    try {
      if (!candidate || typeof candidate !== "object" || !("strategy" in candidate) || !("storyboard" in candidate)) {
        throw new Error("strategy output object must contain strategy and storyboard");
      }
      const normalized = normalizeStrategyCandidate(candidate as { strategy: unknown; storyboard: unknown });
      return { strategy: DemoStrategySchema.parse(normalized.strategy), storyboard: StoryboardSchema.parse(normalized.storyboard) };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("no valid strategy JSON object in strategy output", { cause: lastError });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    for (const key of ["message", "text", "title", "narrative"]) {
      const entry = value[key];
      if (typeof entry === "string" && entry.trim().length > 0) return entry;
    }
  }
  return JSON.stringify(value) ?? String(value);
}

function normalizeStrategy(strategy: unknown) {
  if (!isRecord(strategy)) return strategy;
  if (strategy.version === 1 && strategy.selectedAngle !== undefined && strategy.selectedFlow !== undefined) return strategy;
  const messages = Array.isArray(strategy.messageHierarchy) ? strategy.messageHierarchy.map(messageText) : [];
  const flowId = typeof strategy.coreDemoFlowId === "string" ? strategy.coreDemoFlowId : "flow-1";
  const strategyMessage = typeof strategy.strategyMessage === "string" ? strategy.strategyMessage : messages[0] ?? "Demo the selected product workflow.";
  return {
    version: 1,
    selectedAngle: {
      title: strategyMessage,
      whyThisAngle: strategyMessage,
      targetAudience: messages[1] ?? "prospective users",
      primaryProof: messages[2] ?? strategyMessage,
    },
    selectedFlow: { sourceFlowId: flowId, name: flowId, reason: strategyMessage },
    messageHierarchy: messages.length > 0 ? messages : [strategyMessage],
    successCriteria: Array.isArray(strategy.successCriteria) ? strategy.successCriteria.map(messageText) : [strategyMessage],
    risks: Array.isArray(strategy.risks) ? strategy.risks.map(messageText) : [],
    warnings: Array.isArray(strategy.warnings) ? strategy.warnings.map(messageText) : [],
  };
}

function beatType(index: number, total: number) {
  if (index === 0) return "hook";
  if (index === total - 1) return "cta";
  return index === total - 2 ? "proof" : "screen_capture";
}

function normalizeStoryboard(storyboard: unknown) {
  if (isRecord(storyboard) && storyboard.version === 1) return storyboard;
  const beats = Array.isArray(storyboard) ? storyboard : isRecord(storyboard) && Array.isArray(storyboard.beats) ? storyboard.beats : [];
  const duration = beats.reduce((max, beat) => (isRecord(beat) && typeof beat.endSecond === "number" ? Math.max(max, beat.endSecond) : max), 0) || 12;
  return {
    version: 1,
    title: isRecord(storyboard) && typeof storyboard.title === "string" ? storyboard.title : "Generated demo",
    durationTargetSeconds: duration,
    aspectRatio: isRecord(storyboard) && storyboard.aspectRatio === "9:16" ? "9:16" : isRecord(storyboard) && storyboard.aspectRatio === "1:1" ? "1:1" : "16:9",
    beats: beats.map((beat, index) => {
      const record = isRecord(beat) ? beat : {};
      return {
        id: typeof record.id === "string" ? record.id : `beat-${record.beat ?? index + 1}`,
        type: typeof record.type === "string" ? record.type : beatType(index, beats.length),
        goal: messageText(record.title ?? record.goal ?? record.narrative ?? `Beat ${index + 1}`),
        visual: messageText(record.visual ?? "Product workflow"),
        narrative: messageText(record.narrative ?? record.title ?? `Beat ${index + 1}`),
        strategyMessageId: typeof record.strategyMessageId === "string" ? record.strategyMessageId : `message-${index + 1}`,
        proofPointId: typeof record.proofPointId === "string" ? record.proofPointId : "capability-1",
        expectedUserAction: typeof record.expectedUserAction === "string" ? record.expectedUserAction : null,
        importance: record.importance === "medium" || record.importance === "low" ? record.importance : "high",
        ...(typeof record.startSecond === "number" ? { startHint: record.startSecond } : {}),
        ...(typeof record.endSecond === "number" ? { endHint: record.endSecond } : {}),
      };
    }),
  };
}

function normalizeStrategyCandidate(candidate: { strategy: unknown; storyboard: unknown }) {
  return { strategy: normalizeStrategy(candidate.strategy), storyboard: normalizeStoryboard(candidate.storyboard) };
}

export function createClaudeStrategyAgent(deps: { runSynthesis?: typeof runClaudeAgent; fallback?: Strategize } = {}): Strategize {
  const run = deps.runSynthesis ?? runClaudeAgent;
  const fallback = deps.fallback ?? (async (i) => deriveDemoStrategy(i));
  return async (input) => {
    throwIfAborted(input.signal);
    const prompt = buildStrategyPrompt(input);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        throwIfAborted(input.signal);
        const raw = await run(attempt === 0 ? prompt : `${prompt}\n\nReturn ONLY one valid JSON object with keys strategy and storyboard.`,
          { cwd: process.cwd(), allowedTools: "" });
        throwIfAborted(input.signal);
        return parseStrategyOutput(raw);
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        throwIfAborted(input.signal);
        /* retry then fall through */
      }
    }
    throwIfAborted(input.signal);
    const r = await fallback(input);
    throwIfAborted(input.signal);
    return { strategy: { ...r.strategy, warnings: [...r.strategy.warnings, STRATEGY_FALLBACK_WARNING] }, storyboard: r.storyboard };
  };
}

export function createOpencodeStrategyAgent(deps: { runOpencode?: AiUrlPlannerOpencodeRun; fallback?: Strategize } = {}): Strategize {
  const runOpencode = deps.runOpencode ?? defaultRunAiPlannerOpencode;
  const fallback = deps.fallback ?? (async (i) => deriveDemoStrategy(i));
  return async (input) => {
    throwIfAborted(input.signal);
    const prompt = buildStrategyPrompt(input);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        throwIfAborted(input.signal);
        const raw = await runOpencode(attempt === 0 ? prompt : `${prompt}\n\nReturn ONLY one valid JSON object with keys strategy and storyboard.`, {
          cwd: process.cwd(),
          signal: input.signal,
        });
        throwIfAborted(input.signal);
        return parseStrategyOutput(collectOpencodeText(raw));
      } catch (error) {
        if (isAbortError(error)) throw error;
        throwIfAborted(input.signal);
      }
    }
    throwIfAborted(input.signal);
    const r = await fallback(input);
    throwIfAborted(input.signal);
    return { strategy: { ...r.strategy, warnings: [...r.strategy.warnings, STRATEGY_FALLBACK_WARNING] }, storyboard: r.storyboard };
  };
}
