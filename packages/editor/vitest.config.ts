import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tinker/motion": fileURLToPath(new URL("../motion/src/index.ts", import.meta.url)),
      "@tinker/project-schema": fileURLToPath(new URL("../project-schema/src/index.ts", import.meta.url)),
      "@tinker/rendering": fileURLToPath(new URL("../rendering/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
