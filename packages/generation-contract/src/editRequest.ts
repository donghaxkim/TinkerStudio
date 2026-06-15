import { z } from "zod";

export const EditContextRefSchema = z
  .object({
    // optional so the web ChatContextRef (which carries an id) conforms to this .strict() schema
    id: z.string().min(1).optional(),
    kind: z.enum(["range", "clip"]),
    start: z.number(),
    end: z.number(),
    clipId: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
  })
  .strict();

export const EditCompositionRequestBodySchema = z
  .object({
    instruction: z.string().min(1),
    context: z.array(EditContextRefSchema),
  })
  .strict();

export type EditContextRef = z.infer<typeof EditContextRefSchema>;
export type EditCompositionRequestBody = z.infer<typeof EditCompositionRequestBodySchema>;
