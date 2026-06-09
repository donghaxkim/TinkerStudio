import type { CapturePlan } from "@tinker/browser-capture";
import { assertValidCapturePlan } from "@tinker/browser-capture";
import type { ProductAnalysis } from "@tinker/product-analysis";
import { z } from "zod";
import type { AspectRatio, ManualStoryboard } from "./types.js";

const MISSING_ENV_MESSAGE =
  "TINKER_AI_URL_PLANNER_ENDPOINT, TINKER_AI_URL_PLANNER_API_KEY, and TINKER_AI_URL_PLANNER_MODEL are required";

export type AiUrlPlannerInput = {
  productUrl: string;
  prompt: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  analysis: ProductAnalysis;
};

export type AiUrlPlannerResult = {
  storyboard: ManualStoryboard;
  capturePlan: CapturePlan;
};

export type AiUrlPlanner = (input: AiUrlPlannerInput) => Promise<AiUrlPlannerResult>;

type PlannerResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type PlannerFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<PlannerResponse>;

type EnvironmentAiUrlPlannerOptions = {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: PlannerFetch;
};

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const finiteNumber = z.number().finite();

const storyboardSchema = z
  .object({
    title: nonEmptyString,
    durationCapSeconds: finiteNumber.positive(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
    beats: z
      .array(
        z
          .object({
            id: nonEmptyString,
            type: z.enum(["hook", "screen_capture", "feature", "proof", "cta"]),
            goal: nonEmptyString,
            narration: optionalNonEmptyString,
            startHint: finiteNumber.nonnegative().optional(),
            endHint: finiteNumber.nonnegative().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const gotoStepSchema = z.object({ type: z.literal("goto"), url: nonEmptyString }).strict();
const clickStepSchema = z
  .object({ type: z.literal("click"), selector: optionalNonEmptyString, text: optionalNonEmptyString, label: optionalNonEmptyString })
  .strict()
  .refine((step) => step.selector !== undefined || step.text !== undefined, "click step requires selector or text");
const typeStepSchema = z.object({ type: z.literal("type"), selector: nonEmptyString, text: nonEmptyString }).strict();
const scrollStepSchema = z
  .object({ type: z.literal("scroll"), x: finiteNumber.optional(), y: finiteNumber.optional(), selector: optionalNonEmptyString })
  .strict()
  .refine((step) => step.x !== undefined || step.y !== undefined || step.selector !== undefined, "scroll step requires x, y, or selector");
const hoverStepSchema = z
  .object({ type: z.literal("hover"), selector: optionalNonEmptyString, text: optionalNonEmptyString })
  .strict()
  .refine((step) => step.selector !== undefined || step.text !== undefined, "hover step requires selector or text");
const waitForSelectorStepSchema = z
  .object({ type: z.literal("waitForSelector"), selector: nonEmptyString, timeoutMs: finiteNumber.positive().optional() })
  .strict();
const pauseStepSchema = z.object({ type: z.literal("pause"), ms: finiteNumber.nonnegative() }).strict();

const capturePlanSchema = z
  .object({
    targetUrl: nonEmptyString,
    viewport: z.object({ width: finiteNumber.positive(), height: finiteNumber.positive() }).strict(),
    steps: z
      .array(
        z.discriminatedUnion("type", [
          gotoStepSchema,
          clickStepSchema,
          typeStepSchema,
          scrollStepSchema,
          hoverStepSchema,
          waitForSelectorStepSchema,
          pauseStepSchema,
        ]),
      )
      .min(1),
    expectedCheckpoints: z.array(
      z
        .object({ id: nonEmptyString, label: nonEmptyString, selector: optionalNonEmptyString, text: optionalNonEmptyString })
        .strict()
        .refine(
          (checkpoint) => checkpoint.selector !== undefined || checkpoint.text !== undefined,
          "checkpoint requires selector or text",
        ),
    ),
  })
  .strict();

function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
}

function parseJson(value: string, malformedMessage: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(malformedMessage, { cause: error });
  }
}

export function parseStoryboardJson(value: string): ManualStoryboard {
  const parsed = parseJson(value, "Planner returned malformed storyboard JSON");
  const result = storyboardSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Storyboard is invalid: ${formatZodIssues(result.error)}`);
  }

  return result.data;
}

export function parseCapturePlanJson(value: string): CapturePlan {
  const parsed = parsePlanShape(value);

  try {
    assertValidCapturePlan(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Capture plan is invalid: ${message}`, { cause: error });
  }

  return parsed;
}

function parsePlanShape(value: string): CapturePlan {
  const parsed = parseJson(value, "Planner returned malformed capture plan JSON");
  const result = capturePlanSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Capture plan is invalid: ${formatZodIssues(result.error)}`);
  }

  return result.data;
}

function plannerValueToJson(value: unknown, fieldName: string) {
  if (typeof value === "string") {
    return value;
  }

  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error(`Planner response is missing ${fieldName}`);
  }

  return json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractPlannerPayload(responseBody: unknown) {
  if (typeof responseBody === "string") {
    return parseJson(responseBody, "Planner returned malformed planner response JSON");
  }

  if (!isRecord(responseBody)) {
    return responseBody;
  }

  const firstChoice = Array.isArray(responseBody.choices) ? responseBody.choices[0] : undefined;
  if (isRecord(firstChoice) && isRecord(firstChoice.message) && typeof firstChoice.message.content === "string") {
    return parseJson(firstChoice.message.content, "Planner returned malformed planner response JSON");
  }

  return responseBody;
}

function parsePlannerResult(responseBody: unknown): AiUrlPlannerResult {
  const payload = extractPlannerPayload(responseBody);

  if (!isRecord(payload)) {
    throw new Error("Planner response must contain storyboard and capturePlan");
  }

  return {
    storyboard: parseStoryboardJson(plannerValueToJson(payload.storyboard, "storyboard")),
    capturePlan: parseCapturePlanJson(plannerValueToJson(payload.capturePlan, "capturePlan")),
  };
}

function buildPlannerPrompt(input: AiUrlPlannerInput) {
  return JSON.stringify(
    {
      task: "Create strict JSON for an editable product demo storyboard and deterministic browser capture plan.",
      productUrl: input.productUrl,
      prompt: input.prompt,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      analysis: input.analysis,
      responseShape: {
        storyboard: "ManualStoryboard JSON",
        capturePlan: "CapturePlan JSON",
      },
    },
    null,
    2,
  );
}

export function createEnvironmentAiUrlPlanner(options: EnvironmentAiUrlPlannerOptions = {}): AiUrlPlanner {
  return async (input) => {
    const endpoint = options.endpoint ?? process.env.TINKER_AI_URL_PLANNER_ENDPOINT;
    const apiKey = options.apiKey ?? process.env.TINKER_AI_URL_PLANNER_API_KEY;
    const model = options.model ?? process.env.TINKER_AI_URL_PLANNER_MODEL;
    const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as PlannerFetch | undefined);

    if (!endpoint || !apiKey || !model) {
      throw new Error(MISSING_ENV_MESSAGE);
    }

    if (!fetchImpl) {
      throw new Error("No fetch implementation is available for the AI URL planner");
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildPlannerPrompt(input) }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`AI URL planner request failed with status ${response.status}: ${await response.text()}`);
    }

    return parsePlannerResult(await response.json());
  };
}

function viewportForAspectRatio(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1280, height: 720 };
  }
}

export function createFixtureAiUrlPlanner(): AiUrlPlanner {
  return async (input) => ({
    storyboard: {
      title: input.analysis.title,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      beats: [
        {
          id: "hook",
          type: "hook",
          goal: input.prompt,
          narration: input.analysis.headings[0] ?? "Introduce the product value.",
          startHint: 0,
          endHint: Math.min(3, input.durationCapSeconds),
        },
        {
          id: "screen-capture",
          type: "screen_capture",
          goal: "Show the deterministic browser workflow from hero to export.",
          narration: input.analysis.bodySnippets[0] ?? "Capture the primary product workflow.",
          startHint: Math.min(3, input.durationCapSeconds),
          endHint: Math.max(Math.min(input.durationCapSeconds - 2, input.durationCapSeconds), 0),
        },
        {
          id: "cta",
          type: "cta",
          goal: "End on the editable export result.",
          narration: `Export an editable demo for ${input.analysis.title}.`,
          startHint: Math.max(input.durationCapSeconds - 2, 0),
          endHint: input.durationCapSeconds,
        },
      ],
    },
    capturePlan: {
      targetUrl: input.productUrl,
      viewport: viewportForAspectRatio(input.aspectRatio),
      steps: [
        { type: "goto", url: input.productUrl },
        { type: "waitForSelector", selector: "[data-testid='hero']" },
        { type: "click", selector: "[data-testid='start-demo']" },
        { type: "type", selector: "[data-testid='workspace-name']", text: "Fixture workspace" },
        { type: "pause", ms: 300 },
        { type: "scroll", y: 720 },
        { type: "waitForSelector", selector: "[data-testid='export-card']" },
        { type: "hover", selector: "[data-testid='export-demo']" },
        { type: "click", selector: "[data-testid='export-demo']" },
        { type: "pause", ms: 300 },
      ],
      expectedCheckpoints: [
        { id: "hero-visible", label: "Hero visible", selector: "[data-testid='hero']" },
        { id: "export-visible", label: "Export visible", selector: "[data-testid='export-card']" },
      ],
    },
  });
}
