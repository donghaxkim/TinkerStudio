import type { CompositionEditClient } from "./compositionEditClient.js";

/**
 * Deterministic dev/test double for composition edits. It cannot re-render, so it
 * returns a revision pointing at the job's composition with a cache-busting `?rev=N`
 * query — distinct per edit so the preview iframe reloads (the real endpoint returns
 * genuinely new artifacts under revisions/<revId>/). Mirrors mockCompositionGenerationClient.
 */
export function createMockCompositionEditClient(): CompositionEditClient {
  let counter = 0;
  return {
    async editComposition(request, options) {
      options?.signal?.throwIfAborted();
      options?.onUpdate?.("running");
      counter += 1;
      const rev = counter;
      const base = `/api/jobs/${request.jobId}/artifacts/hyperframes`;
      return {
        id: `rev-${rev}`,
        compositionIndexUrl: `${base}/index.html?rev=${rev}`,
        outputVideoUrl: `${base}/output.mp4?rev=${rev}`,
      };
    },
  };
}
