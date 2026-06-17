import type { CreatePlanningSessionRequest, PlanningSessionResponse } from "@tinker/generation-contract";

export type CreateCompositionPlanningSessionRequest = CreatePlanningSessionRequest;
export type CompositionPlanningSession = PlanningSessionResponse;

export interface CompositionPlanningClient {
  createSession(request: CreateCompositionPlanningSessionRequest): Promise<CompositionPlanningSession>;
  sendMessage(sessionId: string, message: string): Promise<CompositionPlanningSession>;
  /** Reads the current session snapshot, used to poll planning progress while work is in flight. */
  getSession(sessionId: string): Promise<CompositionPlanningSession>;
}
