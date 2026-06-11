import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tinker/editor": fileURLToPath(new URL("../../packages/editor/src/index.ts", import.meta.url)),
      "@tinker/ai-edit-ui": fileURLToPath(new URL("../../packages/ai-edit-ui/src/index.ts", import.meta.url)),
      "@tinker/generation-contract": fileURLToPath(new URL("../../packages/generation-contract/src/index.ts", import.meta.url)),
      "@tinker/motion": fileURLToPath(new URL("../../packages/motion/src/index.ts", import.meta.url)),
      "@tinker/project-schema": fileURLToPath(new URL("../../packages/project-schema/src/index.ts", import.meta.url)),
      "@tinker/rendering": fileURLToPath(new URL("../../packages/rendering/src/index.ts", import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
