import type { CapturePlan } from "@tinker/browser-capture";
import type { ManualStoryboard } from "./types.js";

export function createManualDemoStoryboard(): ManualStoryboard {
  return {
    title: "Tinker Manual Fixture Demo",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    beats: [
      {
        id: "hook",
        type: "hook",
        goal: "Introduce the product promise.",
        narration: "Generate polished product demos without perfect manual takes.",
        startHint: 0,
        endHint: 3.5,
      },
      {
        id: "capture",
        type: "screen_capture",
        goal: "Show the browser automation interacting with product UI.",
        narration: "The agent follows a deterministic capture plan and records structured events.",
        startHint: 3.5,
        endHint: 8,
      },
      {
        id: "export",
        type: "cta",
        goal: "Show the generated draft is ready for editing.",
        narration: "The result is an editable DemoProject, not just a disposable video.",
        startHint: 8,
        endHint: 12,
      },
    ],
  };
}

export function createManualDemoCapturePlan(targetUrl: string): CapturePlan {
  return {
    targetUrl,
    viewport: { width: 1280, height: 720 },
    steps: [
      { type: "goto", url: targetUrl },
      { type: "waitForSelector", selector: "[data-testid='hero']" },
      { type: "click", selector: "[data-testid='start-demo']", label: "Start demo" },
      { type: "type", selector: "[data-testid='workspace-name']", text: "Acme Launch" },
      { type: "pause", ms: 400 },
      { type: "scroll", y: 560 },
      { type: "waitForSelector", selector: "[data-testid='export-card']" },
      { type: "hover", selector: "[data-testid='export-demo']" },
      { type: "click", selector: "[data-testid='export-demo']", label: "Export draft" },
      { type: "pause", ms: 700 },
    ],
    expectedCheckpoints: [
      { id: "hero-visible", label: "Hero section is visible", selector: "[data-testid='hero']" },
      { id: "export-visible", label: "Export card is visible", selector: "[data-testid='export-card']" },
      { id: "export-copy-visible", label: "Export copy is visible", text: "editable DemoProject" },
    ],
  };
}
