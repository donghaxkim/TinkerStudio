import type { CapturePlan, CaptureResult } from "@tinker/browser-capture";
import type { AspectRatioSchema } from "@tinker/project-schema";
import type { z } from "zod";

export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export type ManualStoryboardBeat = {
  id: string;
  type: "hook" | "screen_capture" | "feature" | "proof" | "cta";
  goal: string;
  narration?: string;
  startHint?: number;
  endHint?: number;
};

export type ManualStoryboard = {
  title: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  beats: ManualStoryboardBeat[];
};

export type CompileProjectInput = {
  projectId: string;
  storyboard: ManualStoryboard;
  capturePlan: CapturePlan;
  captureResult: CaptureResult;
  outputRoot: string;
  createdAt: string;
  sourceRepoUrl?: string;
  productUrl?: string;
  prompt?: string;
};
