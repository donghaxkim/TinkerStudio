import type { ApiGenerationJob } from "@tinker/generation-contract";

export type ImportFileInput = { relativePath: string; data: Blob };

export type CompositionImportClient = {
  importComposition(files: ImportFileInput[], signal?: AbortSignal): Promise<ApiGenerationJob>;
};
