import { PlanningSessionResponseSchema } from "@tinker/generation-contract";
import type {
  CompositionPlanningClient,
  CompositionPlanningSession,
  CreateCompositionPlanningSessionRequest,
} from "./compositionPlanningClient.js";

export type HttpCompositionPlanningClientOptions = { baseUrl?: string; fetchFn?: typeof fetch };

export function createHttpCompositionPlanningClient(
  options: HttpCompositionPlanningClientOptions = {},
): CompositionPlanningClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async createSession(request: CreateCompositionPlanningSessionRequest): Promise<CompositionPlanningSession> {
      return readPlanningSession(
        await fetchFn(`${baseUrl}/api/planning-sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        }),
      );
    },

    async sendMessage(sessionId: string, message: string): Promise<CompositionPlanningSession> {
      return readPlanningSession(
        await fetchFn(`${baseUrl}/api/planning-sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        }),
      );
    },
  };
}

async function readPlanningSession(response: Response): Promise<CompositionPlanningSession> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error(`Server returned a non-JSON response (status ${response.status})`);
  }
  const parsed = PlanningSessionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Malformed planning session response: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return parsed.data;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: unknown; lastError?: unknown };
    if (typeof json?.message === "string" && json.message.length > 0) {
      return json.message;
    }
    if (typeof json?.lastError === "string" && json.lastError.length > 0) {
      return json.lastError;
    }
  } catch {
    // body was not JSON; fall through
  }
  return `Request failed with status ${response.status}`;
}
