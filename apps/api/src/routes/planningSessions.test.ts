import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DemoOutline } from "@tinker/generation-contract";
import { buildServer } from "../server.js";
import type { PlanningAgentRunner, PlanningAgentTurnResult } from "../planning/planningRunner.js";

function testConfig(repoRoot: string) {
  return {
    port: 4500,
    host: "127.0.0.1" as const,
    corsOrigins: ["http://localhost:5173"],
    repoRoot,
  };
}

const outline: DemoOutline = {
  title: "Fixture demo",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
  summary: "A grounded product demo.",
  scenes: [{ id: "scene-1", goal: "Open with proof", visual: "Show the homepage.", evidence: ["website"] }],
  generationNotes: [],
};

describe("planning session routes", () => {
  it("creates a planning session and returns the validated outline", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-${randomUUID()}-`));
    const runner: PlanningAgentRunner = async (input) => {
      expect(input.kind).toBe("initial");
      expect(input.productUrl).toBe("https://product.example.com");
      expect(input.repoUrl).toBe("https://github.com/example/product");
      expect(input.outlinePath).toContain("outline.json");
      await writeFile(input.outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
      return {
        assistantMessage: "I drafted a one-scene outline.",
        agentResumeHandle: "claude-session-1",
        repoCheckoutDirectory: join(input.workspaceRoot, "repository"),
        websiteAnalysisPath: join(input.workspaceRoot, "website-analysis.json"),
        repoAnalysisPath: join(input.workspaceRoot, "repo-analysis.json"),
      };
    };
    const server = await buildServer({ config: testConfig(repoRoot), idGenerator: () => "plan-test", planningRunner: runner });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: {
          productUrl: "https://product.example.com",
          repoUrl: "https://github.com/example/product",
          agent: "claude",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toMatchObject({
        id: "plan-test",
        productUrl: "https://product.example.com",
        repoUrl: "https://github.com/example/product",
        agent: "claude",
        status: "ready",
        messages: [{ role: "assistant", content: "I drafted a one-scene outline." }],
        outline,
        outlineValid: true,
      });
      await expect(readFile(join(repoRoot, "generated", "planning", "plan-test", "outline.json"), "utf8")).resolves.toContain("Fixture demo");
    } finally {
      await server.close();
    }
  });

  it("continues a session with the stored resume handle", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-continue-${randomUUID()}-`));
    const calls: string[] = [];
    const runner: PlanningAgentRunner = async (input) => {
      calls.push(input.kind);
      await writeFile(input.outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
      return {
        assistantMessage: input.kind === "initial" ? "Initial outline." : `Updated after: ${input.message}`,
        agentResumeHandle: input.kind === "initial" ? "session-initial" : `${input.agentResumeHandle}-continued`,
      };
    };
    const server = await buildServer({ config: testConfig(repoRoot), idGenerator: () => "plan-test", planningRunner: runner });

    try {
      await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { productUrl: "https://product.example.com", repoUrl: "https://github.com/example/product", agent: "claude" },
      });
      const response = await server.inject({
        method: "POST",
        url: "/api/planning-sessions/plan-test/messages",
        payload: { message: "Make it more technical." },
      });

      expect(response.statusCode).toBe(200);
      expect(calls).toEqual(["initial", "followup"]);
      expect(JSON.parse(response.body)).toMatchObject({
        status: "ready",
        messages: [
          { role: "assistant", content: "Initial outline." },
          { role: "user", content: "Make it more technical." },
          { role: "assistant", content: "Updated after: Make it more technical." },
        ],
        outlineValid: true,
      });
    } finally {
      await server.close();
    }
  });

  it("rejects concurrent messages to the same planning session", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-concurrent-${randomUUID()}-`));
    let releaseFollowup: (() => void) | undefined;
    let resolveFollowupStarted: (() => void) | undefined;
    const followupStarted = new Promise<void>((resolve) => {
      resolveFollowupStarted = resolve;
    });
    const runner: PlanningAgentRunner = async (input) => {
      if (input.kind === "followup") {
        resolveFollowupStarted?.();
        await new Promise<void>((resolve) => {
          releaseFollowup = resolve;
        });
      }
      await writeFile(input.outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
      return { assistantMessage: "Outline updated.", agentResumeHandle: "session-1" };
    };
    const server = await buildServer({ config: testConfig(repoRoot), idGenerator: () => "plan-test", planningRunner: runner });

    try {
      await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { productUrl: "https://product.example.com", repoUrl: "https://github.com/example/product", agent: "claude" },
      });
      const firstMessage = server.inject({
        method: "POST",
        url: "/api/planning-sessions/plan-test/messages",
        payload: { message: "First change." },
      });
      await followupStarted;
      const secondMessage = await server.inject({
        method: "POST",
        url: "/api/planning-sessions/plan-test/messages",
        payload: { message: "Second change." },
      });

      expect(secondMessage.statusCode).toBe(409);
      releaseFollowup?.();
      await firstMessage;
    } finally {
      releaseFollowup?.();
      await server.close();
    }
  });

  it("returns outlineValid false when the agent writes invalid outline JSON", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-invalid-outline-${randomUUID()}-`));
    const runner: PlanningAgentRunner = async (input) => {
      await writeFile(input.outlinePath, JSON.stringify({ title: "Missing required fields" }));
      return { assistantMessage: "I need another turn to finish the outline.", agentResumeHandle: "session-1" };
    };
    const server = await buildServer({ config: testConfig(repoRoot), idGenerator: () => "plan-test", planningRunner: runner });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { productUrl: "https://product.example.com", repoUrl: "https://github.com/example/product", agent: "claude" },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toMatchObject({ status: "ready", outlineValid: false });
      expect(JSON.parse(response.body).outline).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("returns a stable error response when the runner emits an invalid assistant message", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-invalid-message-${randomUUID()}-`));
    const runner: PlanningAgentRunner = async (input) => {
      await writeFile(input.outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
      return { assistantMessage: "", agentResumeHandle: "session-1" };
    };
    const server = await buildServer({ config: testConfig(repoRoot), idGenerator: () => "plan-test", planningRunner: runner });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { productUrl: "https://product.example.com", repoUrl: "https://github.com/example/product", agent: "claude" },
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toMatchObject({
        id: "plan-test",
        status: "error",
        messages: [],
        outlineValid: false,
      });
      expect(JSON.parse(response.body).lastError).toEqual(expect.any(String));
    } finally {
      await server.close();
    }
  });

  it.each([
    ["omits", undefined],
    ["blanks", "   "],
  ] as const)("returns an error instead of ready when the runner %s the resume handle", async (_label, agentResumeHandle) => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-invalid-resume-${randomUUID()}-`));
    const calls: string[] = [];
    const runner: PlanningAgentRunner = async (input) => {
      calls.push(input.kind);
      await writeFile(input.outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
      return {
        assistantMessage: "I drafted a one-scene outline.",
        ...(agentResumeHandle === undefined ? {} : { agentResumeHandle }),
      } as unknown as PlanningAgentTurnResult;
    };
    const server = await buildServer({ config: testConfig(repoRoot), idGenerator: () => "plan-test", planningRunner: runner });

    try {
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { productUrl: "https://product.example.com", repoUrl: "https://github.com/example/product", agent: "claude" },
      });
      const followupResponse = await server.inject({
        method: "POST",
        url: "/api/planning-sessions/plan-test/messages",
        payload: { message: "Continue the outline." },
      });

      expect(createResponse.statusCode).toBe(500);
      expect(JSON.parse(createResponse.body)).toMatchObject({
        id: "plan-test",
        status: "error",
        messages: [],
        outlineValid: false,
      });
      expect(JSON.parse(createResponse.body).lastError).toContain("resume handle");
      expect(followupResponse.statusCode).toBe(409);
      expect(calls).toEqual(["initial"]);
    } finally {
      await server.close();
    }
  });

  it("rejects OpenCode planning until a real resume adapter exists", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-opencode-${randomUUID()}-`));
    const server = await buildServer({ config: testConfig(repoRoot), idGenerator: () => "plan-test" });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { productUrl: "https://product.example.com", repoUrl: "https://github.com/example/product", agent: "opencode" },
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toMatchObject({
        id: "plan-test",
        status: "error",
        lastError: "OpenCode planning sessions require a resumable session adapter before they can be used.",
      });
    } finally {
      await server.close();
    }
  });

  it("plans repo-only and exposes a snapshot via GET for progress polling", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-get-${randomUUID()}-`));
    let receivedProductUrl: string | undefined = "unset";
    const runner: PlanningAgentRunner = async (input) => {
      receivedProductUrl = input.productUrl;
      input.onProgress?.("preparing", "done");
      input.onProgress?.("drafting", "done");
      await writeFile(input.outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
      return { assistantMessage: "Outline ready.", agentResumeHandle: "session-1" };
    };
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "plan-get",
      planningRunner: runner,
      productUrlResolver: async () => undefined,
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { repoUrl: "https://github.com/example/product", agent: "claude" },
      });
      expect(created.statusCode).toBe(201);
      expect(receivedProductUrl).toBeUndefined();
      expect(JSON.parse(created.body).productUrl).toBeUndefined();

      const got = await server.inject({ method: "GET", url: "/api/planning-sessions/plan-get" });
      expect(got.statusCode).toBe(200);
      expect(JSON.parse(got.body)).toMatchObject({ id: "plan-get", status: "ready", outlineValid: true });

      const missing = await server.inject({ method: "GET", url: "/api/planning-sessions/does-not-exist" });
      expect(missing.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("honors a client-supplied UUID session id", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-clientid-${randomUUID()}-`));
    const runner: PlanningAgentRunner = async (input) => {
      await writeFile(input.outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
      return { assistantMessage: "Outline ready.", agentResumeHandle: "session-1" };
    };
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "server-id",
      planningRunner: runner,
      productUrlResolver: async () => undefined,
    });
    const clientId = randomUUID();

    try {
      const created = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { id: clientId, repoUrl: "https://github.com/example/product", agent: "claude" },
      });
      expect(created.statusCode).toBe(201);
      expect(JSON.parse(created.body).id).toBe(clientId);

      const got = await server.inject({ method: "GET", url: `/api/planning-sessions/${clientId}` });
      expect(got.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("rejects invalid create-session URLs", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-planning-validation-${randomUUID()}-`));
    const server = await buildServer({ config: testConfig(repoRoot), planningRunner: async () => ({ assistantMessage: "unused", agentResumeHandle: "unused" }) });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/planning-sessions",
        payload: { productUrl: "file:///tmp/product.html", repoUrl: "https://github.com/example/product", agent: "claude" },
      });

      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body)).toMatchObject({ status: "failed", stage: "validation" });
    } finally {
      await server.close();
    }
  });
});
