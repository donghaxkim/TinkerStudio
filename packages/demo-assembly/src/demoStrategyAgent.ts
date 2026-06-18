import { runClaudeAgent } from "./claudeCodeAgent.js";
import { DemoStrategySchema, StoryboardSchema, deriveDemoStrategy,
  type DemoStrategyResult, type DeriveDemoStrategyInput, type Strategize } from "./demoStrategy.js";

export function buildStrategyPrompt(input: DeriveDemoStrategyInput): string {
  return JSON.stringify({
    task: "Design the demo story. Output ONE JSON object with keys strategy and storyboard.",
    instructions: [
      "Open on the PROBLEM and audience from valueNarrative; demo the rank-1 flow; prove it with the flow's expectedOutcome; close on whyItMatters.",
      "Every storyboard beat: set narrative to the viewer-level point (use flow.viewerTakeaway for the proof beat). strategyMessageId references messageHierarchy by 1-based id message-N. proofPointId references a real capability id.",
      "Do not invent product facts beyond the provided understanding.",
      "Output ONLY the JSON object — no prose, no code fences.",
    ],
    understanding: input.understanding,
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
  }, null, 2);
}

export function parseStrategyOutput(raw: string): DemoStrategyResult {
  const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in strategy output");
  const obj = JSON.parse(raw.slice(start, end + 1));
  return { strategy: DemoStrategySchema.parse(obj.strategy), storyboard: StoryboardSchema.parse(obj.storyboard) };
}

export function createClaudeStrategyAgent(deps: { runSynthesis?: typeof runClaudeAgent; fallback?: Strategize } = {}): Strategize {
  const run = deps.runSynthesis ?? runClaudeAgent;
  const fallback = deps.fallback ?? (async (i) => deriveDemoStrategy(i));
  return async (input) => {
    const prompt = buildStrategyPrompt(input);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await run(attempt === 0 ? prompt : `${prompt}\n\nReturn ONLY one valid JSON object with keys strategy and storyboard.`,
          { cwd: process.cwd(), allowedTools: "" });
        return parseStrategyOutput(raw);
      } catch { /* retry then fall through */ }
    }
    const r = await fallback(input);
    return { strategy: { ...r.strategy, warnings: [...r.strategy.warnings, "Strategy agent failed; used deterministic strategy."] }, storyboard: r.storyboard };
  };
}
