import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CompositionPlanningClient,
  CompositionPlanningSession,
  CreateCompositionPlanningSessionRequest,
} from "./compositionPlanningClient.js";

const POLL_INTERVAL_MS = 700;

/** A UUID is required by the contract so the id is always a safe server-side path segment. */
function randomSessionId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto !== undefined && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export type CompositionPlanningFlowState = {
  /** Latest snapshot: a polled in-flight snapshot while busy, or the settled result. */
  session?: CompositionPlanningSession;
  /** A create or follow-up request is in flight. */
  busy: boolean;
  error?: string;
};

export type StartPlanningRequest = Omit<CreateCompositionPlanningSessionRequest, "id">;

export type UseCompositionPlanningSession = CompositionPlanningFlowState & {
  start: (request: StartPlanningRequest) => void;
  sendMessage: (message: string) => void;
  reset: () => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drives a planning session: it fires `createSession` and, while that request is in
 * flight, polls `getSession` so planning progress streams into the UI. The settled
 * session always comes from the create/follow-up response, not the poll.
 */
export function useCompositionPlanningSession(client: CompositionPlanningClient): UseCompositionPlanningSession {
  const [state, setState] = useState<CompositionPlanningFlowState>({ busy: false });
  const stateRef = useRef(state);
  const tokenRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== undefined) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  }, []);

  const start = useCallback(
    (request: StartPlanningRequest) => {
      stopPolling();
      const token = tokenRef.current + 1;
      tokenRef.current = token;
      setState({ busy: true, session: undefined, error: undefined });

      const id = randomSessionId();
      pollRef.current = setInterval(() => {
        void client
          .getSession(id)
          .then((snapshot) => {
            if (tokenRef.current !== token) return;
            // Reflect live progress only while the create request is still pending.
            setState((prev) => (prev.busy ? { ...prev, session: snapshot } : prev));
          })
          .catch(() => {
            // 404 before the session record exists, or a transient read error: keep polling.
          });
      }, POLL_INTERVAL_MS);

      void client
        .createSession({ ...request, id })
        .then((session) => {
          if (tokenRef.current !== token) return;
          stopPolling();
          setState({ busy: false, session });
        })
        .catch((error: unknown) => {
          if (tokenRef.current !== token) return;
          stopPolling();
          setState({ busy: false, session: undefined, error: errorMessage(error) });
        });
    },
    [client, stopPolling],
  );

  const sendMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      const current = stateRef.current;
      if (current.busy || current.session === undefined || trimmed === "") return;

      const sessionId = current.session.id;
      const token = tokenRef.current + 1;
      tokenRef.current = token;
      // Optimistically show the user's message; the response replaces it with the full transcript.
      const optimistic: CompositionPlanningSession = {
        ...current.session,
        messages: [...current.session.messages, { role: "user", content: trimmed }],
      };
      setState({ busy: true, session: optimistic });

      void client
        .sendMessage(sessionId, trimmed)
        .then((session) => {
          if (tokenRef.current === token) setState({ busy: false, session });
        })
        .catch((error: unknown) => {
          if (tokenRef.current === token) setState({ busy: false, session: optimistic, error: errorMessage(error) });
        });
    },
    [client],
  );

  const reset = useCallback(() => {
    stopPolling();
    tokenRef.current += 1;
    setState({ busy: false });
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { ...state, start, sendMessage, reset };
}
