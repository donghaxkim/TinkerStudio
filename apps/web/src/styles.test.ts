import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

function declarationBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? "";
}

describe("planner transcript layout styles", () => {
  it("keeps transcript messages from shrinking so long outlines create body scroll", () => {
    expect(declarationBlock(".tk-cd-msg")).toMatch(/flex-shrink\s*:\s*0\s*;/);
  });
});
