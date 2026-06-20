import { z } from "zod";
import type { AspectRatio } from "./types.js";

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const finiteNumber = z.number().finite();
const viewportSchema = z.object({ width: finiteNumber.positive(), height: finiteNumber.positive() }).strict();
const outputFormatSchema = z.enum(["mp4"]);

const clickStepSchema = z
  .object({ action: z.literal("click"), selector: nonEmptyString, zoom: finiteNumber.gt(1).optional() })
  .strict()
  .refine((step) => step.selector !== undefined, "click step requires selector");
const typeStepSchema = z.object({ action: z.literal("type"), selector: nonEmptyString, text: nonEmptyString }).strict();
const fillStepSchema = z.object({ action: z.literal("fill"), selector: nonEmptyString, text: nonEmptyString }).strict();
const keyboardStepSchema = z.object({ action: z.literal("keyboard"), key: nonEmptyString }).strict();
const scrollStepSchema = z
  .object({ action: z.literal("scroll"), x: finiteNumber.optional(), y: finiteNumber.optional() })
  .strict()
  .refine((step) => step.x !== undefined || step.y !== undefined, "scroll step requires x or y");
const hoverStepSchema = z
  .object({ action: z.literal("hover"), selector: nonEmptyString })
  .strict()
  .refine((step) => step.selector !== undefined, "hover step requires selector");
const waitStepSchema = z.object({ action: z.literal("wait"), ms: finiteNumber.nonnegative().max(30_000) }).strict();
const zoomStepSchema = z
  .object({ action: z.literal("zoom"), selector: optionalNonEmptyString, scale: finiteNumber.positive().optional(), duration: finiteNumber.nonnegative().optional() })
  .strict();
const screenshotStepSchema = z.object({ action: z.literal("screenshot"), name: optionalNonEmptyString }).strict();

const CURSOR_PRODUCING_ACTIONS = new Set(["click", "hover", "type", "fill"]);

function isCursorEnabled(cursor: TestreelRecordingDefinition["cursor"]) {
  return cursor === undefined || cursor === true || (typeof cursor === "object" && cursor.enabled !== false);
}

function isZoomProducingStep(step: TestreelStep) {
  return (step.action === "zoom" && (step.scale ?? 2) !== 1) || (step.action === "click" && step.zoom !== undefined);
}

export const TestreelStepSchema = z.discriminatedUnion("action", [
  clickStepSchema,
  typeStepSchema,
  fillStepSchema,
  keyboardStepSchema,
  scrollStepSchema,
  hoverStepSchema,
  waitStepSchema,
  zoomStepSchema,
  screenshotStepSchema,
]);

export const TestreelRecordingDefinitionSchema = z
  .object({
    url: nonEmptyString,
    viewport: viewportSchema.optional(),
    outputSize: viewportSchema.optional(),
    outputFormat: outputFormatSchema.default("mp4"),
    speed: finiteNumber.positive().optional(),
    waitForSelector: optionalNonEmptyString,
    cursor: z.union([z.boolean(), z.object({ enabled: z.boolean().optional(), size: finiteNumber.positive().optional(), rippleSize: finiteNumber.nonnegative().optional(), rippleColor: optionalNonEmptyString }).strict()]).optional(),
    chrome: z.union([z.boolean(), z.object({ enabled: z.boolean().optional(), url: z.union([z.boolean(), nonEmptyString]).optional() }).passthrough()]).optional(),
    background: z.union([z.boolean(), z.object({ enabled: z.boolean().optional(), color: optionalNonEmptyString, gradient: z.object({ from: nonEmptyString, to: nonEmptyString }).strict().optional(), padding: finiteNumber.nonnegative().optional(), borderRadius: finiteNumber.nonnegative().optional() }).strict()]).optional(),
    steps: z.array(TestreelStepSchema).min(1).max(80),
  })
  .strict();

export const TestreelGenerationPlanSchema = z
  .object({
    engine: z.literal("testreel"),
    definition: TestreelRecordingDefinitionSchema,
    expectedCheckpoints: z
      .array(z.object({ id: nonEmptyString, label: nonEmptyString, selector: optionalNonEmptyString, text: optionalNonEmptyString }).strict())
      .max(20),
    notes: z.array(nonEmptyString).optional(),
  })
  .strict()
  .superRefine((plan, context) => {
    if (isCursorEnabled(plan.definition.cursor) && !plan.definition.steps.some((step) => CURSOR_PRODUCING_ACTIONS.has(step.action))) {
      context.addIssue({ code: "custom", path: ["definition", "steps"], message: "cursor-enabled Testreel plans require at least one cursor-producing action" });
    }

    if (!plan.definition.steps.some(isZoomProducingStep)) {
      context.addIssue({ code: "custom", path: ["definition", "steps"], message: "Testreel plans require at least one zoom-producing step" });
    }
  });

export type TestreelStep = z.infer<typeof TestreelStepSchema>;
export type TestreelRecordingDefinition = z.infer<typeof TestreelRecordingDefinitionSchema>;
export type TestreelGenerationPlan = z.infer<typeof TestreelGenerationPlanSchema>;

function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Planner returned malformed Testreel generation plan JSON", { cause: error });
  }
}

function assertNoEnvSubstitution(value: unknown, path: string) {
  if (typeof value === "string" && /(\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*)/.test(value)) {
    throw new Error(`Testreel generation plan is invalid: environment variable substitution is not allowed at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEnvSubstitution(entry, `${path}.${index}`));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) assertNoEnvSubstitution(entry, `${path}.${key}`);
  }
}

export function parseTestreelGenerationPlanJson(value: string): TestreelGenerationPlan {
  const parsed = parseJson(value);
  assertNoEnvSubstitution(parsed, "recordingPlan");
  const result = TestreelGenerationPlanSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Testreel generation plan is invalid: ${formatZodIssues(result.error)}`);
  return result.data;
}

export function assertTestreelPlanMatchesProductUrl(plan: TestreelGenerationPlan, productUrl: string) {
  const expectedOrigin = new URL(productUrl).origin;
  const actualUrl = new URL(plan.definition.url);
  if (actualUrl.origin !== expectedOrigin) {
    throw new Error("Testreel generation plan is invalid: recording URL must stay on product origin");
  }
}

export function viewportForAspectRatio(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1280, height: 720 };
  }
}

export function outputSizeForAspectRatio(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1920, height: 1080 };
  }
}

export function createFixtureTestreelGenerationPlan(input: { productUrl: string; aspectRatio: AspectRatio; title: string }): TestreelGenerationPlan {
  return TestreelGenerationPlanSchema.parse({
    engine: "testreel",
    definition: {
      url: input.productUrl,
      viewport: viewportForAspectRatio(input.aspectRatio),
      outputSize: outputSizeForAspectRatio(input.aspectRatio),
      outputFormat: "mp4",
      cursor: { enabled: true, size: 48, rippleSize: 100 },
      chrome: { enabled: true, url: true },
      background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" }, padding: 60, borderRadius: 18 },
      steps: [
        { action: "wait", ms: 500 },
        { action: "hover", selector: "body" },
        { action: "screenshot", name: "hero" },
        { action: "scroll", y: 720 },
        { action: "zoom", selector: "body", scale: 1.25, duration: 600 },
        { action: "wait", ms: 300 },
        { action: "zoom", scale: 1, duration: 400 },
        { action: "screenshot", name: "final" },
      ],
    },
    expectedCheckpoints: [{ id: "final-screen", label: `${input.title} final screen`, selector: "body" }],
    notes: ["Fixture Testreel plan uses safe wait, screenshot, and scroll actions."],
  });
}
