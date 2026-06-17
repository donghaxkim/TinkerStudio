import { safeParseApiGenerationJob, type ApiGenerationJob } from "@tinker/generation-contract";
import type { CompositionImportClient, ImportFileInput } from "./compositionImportClient.js";

export type HttpCompositionImportClientOptions = {
  /** Base URL for the API. Default "" → same-origin via the Vite dev proxy. */
  baseUrl?: string;
  /** Injectable fetch for tests. Default: global fetch. */
  fetchFn?: typeof fetch;
};

export function createHttpCompositionImportClient(
  options: HttpCompositionImportClientOptions = {},
): CompositionImportClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async importComposition(files: ImportFileInput[], signal?: AbortSignal): Promise<ApiGenerationJob> {
      const form = new FormData();
      for (const file of files) {
        const name = file.relativePath.split("/").pop() ?? file.relativePath;
        form.append(file.relativePath, file.data, name);
      }
      const response = await fetchFn(`${baseUrl}/api/jobs/import`, { method: "POST", body: form, signal });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new Error(`Server returned a non-JSON response (status ${response.status})`);
      }
      const parsed = safeParseApiGenerationJob(raw);
      if (!parsed.success) {
        throw new Error(`Malformed job response: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
      }
      return parsed.data;
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: unknown };
    if (typeof json?.message === "string" && json.message.length > 0) return json.message;
  } catch {
    // body was not JSON; fall through
  }
  return `Request failed with status ${response.status}`;
}
