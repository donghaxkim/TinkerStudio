import type { AspectRatioSchema } from "@tinker/project-schema";
import type { z } from "zod";

export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export type ManualStoryboardBeat = {
  id: string;
  type: "hook" | "screen_capture" | "feature" | "proof" | "cta";
  goal: string;
  startHint?: number;
  endHint?: number;
};

export type ManualStoryboard = {
  title: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  beats: ManualStoryboardBeat[];
};
