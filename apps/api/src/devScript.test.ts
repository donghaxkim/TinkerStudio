import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("api dev script", () => {
  test("rebuilds dist-backed workspace packages before launching", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const devScript = packageJson.scripts?.dev ?? "";
    const launchCommand = "tsx src/main.ts";

    expect(devScript).toContain("pnpm --filter @tinker/generation-contract build");
    expect(devScript).toContain("pnpm --filter @tinker/product-analysis build");
    expect(devScript).toContain("pnpm --filter @tinker/demo-assembly build");
    expect(devScript.indexOf("pnpm --filter @tinker/demo-assembly build")).toBeLessThan(devScript.indexOf(launchCommand));
    expect(devScript.trim().endsWith(launchCommand)).toBe(true);
  });
});
