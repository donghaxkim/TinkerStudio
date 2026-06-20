import type { DemoOutline, PlanningProgressEntry } from "@tinker/generation-contract";
import type {
  CompositionPlanningClient,
  CompositionPlanningSession,
  CreateCompositionPlanningSessionRequest,
} from "./compositionPlanningClient.js";

// Dev-only stand-in for the planning backend so the planning/chat UI can be
// previewed and styled without opencode/claude or the API running.

const SAMPLE_OUTLINE: DemoOutline = {
  title: "Driftboard - ship updates without the standup",
  durationCapSeconds: 45,
  aspectRatio: "16:9",
  summary:
    "A 45-second walkthrough showing how a team turns scattered GitHub activity into a shareable progress board in three clicks.",
  scenes: [
    {
      id: "scene-1",
      goal: "Hook - the problem",
      visual: "Landing hero with the tagline; cursor drifts toward the Connect repo button.",
      narration: "Standups eat an hour a day. Driftboard turns your repo activity into the update for you.",
      startHint: 0,
      endHint: 12,
      evidence: ["website"],
    },
    {
      id: "scene-2",
      goal: "Core - connect a repo",
      visual: "Paste a GitHub URL; the board fills with cards grouped by status as commits stream in.",
      narration: "Point it at any repo and Driftboard groups the work - in review, shipped, blocked - automatically.",
      startHint: 12,
      endHint: 32,
      evidence: ["repo", "website"],
    },
    {
      id: "scene-3",
      goal: "Payoff - share it",
      visual: "Click Share; a public link copies and the recipient sees the same board, read-only.",
      narration: "One link, and everyone sees the same picture. No meeting required.",
      startHint: 32,
      endHint: 45,
      evidence: ["website"],
    },
  ],
  generationNotes: ["Keep the cursor motion smooth and slow.", "Emphasize the board filling in during scene 2."],
};

const DONE_PROGRESS: PlanningProgressEntry[] = [
  { stage: "preparing", status: "done" },
  { stage: "analyzing-repo", status: "done" },
  { stage: "analyzing-website", status: "done" },
  { stage: "drafting", status: "done" },
];

const THOUGHTS = [
  "Cloning acme/driftboard and mapping the project structure...",
  "Reading the README and entry points - this is a GitHub-activity dashboard.",
  "Tracing the core flow: paste a repo URL, the board fills with status-grouped cards.",
  "Visiting driftboard.example.com - the hero pitches ship updates without the standup.",
  "The Connect repo moment is the clearest aha; I'll center the demo on it.",
  "Shaping a 45-second arc: hook, connect a repo, share the board.",
  "Drafting scene beats, narration, and timing hints.",
];

const THINK_STEP_MS = 850;
const THINK_TOTAL_MS = 6500;
const DEFAULT_REQUEST: CreateCompositionPlanningSessionRequest = {
  repoUrl: "https://github.com/acme/driftboard",
  productUrl: "https://driftboard.example.com",
  agent: "opencode",
};

export function createMockCompositionPlanningClient(): CompositionPlanningClient {
  let current: CompositionPlanningSession | undefined;
  let activeRequest: CreateCompositionPlanningSessionRequest | undefined;
  let startedAt = 0;

  const buildReady = (request: CreateCompositionPlanningSessionRequest): CompositionPlanningSession => ({
    id: request.id ?? "mock-planning-session",
    repoUrl: request.repoUrl,
    productUrl: request.productUrl,
    agent: request.agent ?? "opencode",
    status: "ready",
    messages: [
      {
        role: "assistant",
        content:
          "I read through the repo and the site. Here's a 45-second outline built around the connect-a-repo moment - tell me what you'd change and I'll revise it.",
      },
    ],
    progress: DONE_PROGRESS,
    thoughts: THOUGHTS,
    outline: SAMPLE_OUTLINE,
    outlineValid: true,
  });

  const buildThinking = (request: CreateCompositionPlanningSessionRequest): CompositionPlanningSession => {
    const elapsed = Date.now() - startedAt;
    const revealed = Math.min(THOUGHTS.length, Math.floor(elapsed / THINK_STEP_MS) + 1);
    return {
      id: request.id ?? "mock-planning-session",
      repoUrl: request.repoUrl,
      productUrl: request.productUrl,
      agent: request.agent ?? "opencode",
      status: "running",
      messages: [],
      progress: [],
      thoughts: THOUGHTS.slice(0, revealed),
      outlineValid: false,
    };
  };

  return {
    createSession(request) {
      activeRequest = request;
      startedAt = Date.now();
      current = buildThinking(request);
      return new Promise((resolve) => {
        setTimeout(() => {
          current = buildReady(request);
          resolve(current);
        }, THINK_TOTAL_MS);
      });
    },
    async sendMessage(_sessionId, message) {
      const base = current ?? buildReady(DEFAULT_REQUEST);
      current = {
        ...base,
        messages: [
          ...base.messages,
          { role: "user", content: message },
          { role: "assistant", content: "Good note - I've folded that into the outline. Take a look and keep refining." },
        ],
      };
      return current;
    },
    async getSession() {
      if (current !== undefined && current.status === "running") return buildThinking(activeRequest ?? DEFAULT_REQUEST);
      return current ?? buildReady(DEFAULT_REQUEST);
    },
  };
}
