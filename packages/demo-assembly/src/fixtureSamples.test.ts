import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ManualStoryboard } from "./types.js";

function readFixture(path: string) {
  return JSON.parse(readFileSync(resolve("../../packages/project-schema/fixtures", path), "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
}

function expectNumber(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
}

function expectArray(value: unknown, message: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
}

function expectManualStoryboard(value: unknown): asserts value is ManualStoryboard {
  if (!isRecord(value)) throw new Error("storyboard fixture must be an object");
  expectString(value.title, "storyboard fixture must include title");
  expectString(value.aspectRatio, "storyboard fixture must include aspectRatio");
  expectNumber(value.durationCapSeconds, "storyboard fixture must include durationCapSeconds");
  expectArray(value.beats, "storyboard fixture must include beats");

  for (const beat of value.beats) {
    if (!isRecord(beat)) throw new Error("storyboard beat must be an object");
    expectString(beat.id, "storyboard beat must include id");
    expectString(beat.type, "storyboard beat must include type");
    expectString(beat.goal, "storyboard beat must include goal");
  }
}

const storyboard = readFixture("storyboard.sample.json");
expectManualStoryboard(storyboard);

console.log("fixture sample shape tests passed");
