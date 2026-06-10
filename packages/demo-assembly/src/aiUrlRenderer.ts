export const AI_URL_RENDERERS = ["hyperframes", "playwright", "both"] as const;
export type AiUrlRenderer = (typeof AI_URL_RENDERERS)[number];

export function isAiUrlRenderer(value: string): value is AiUrlRenderer {
  return AI_URL_RENDERERS.some((renderer) => renderer === value);
}
