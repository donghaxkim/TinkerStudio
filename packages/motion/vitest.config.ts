import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@tinker/project-schema": fileURLToPath(new URL("../project-schema/src/index.ts", import.meta.url)),
    },
  },
});
