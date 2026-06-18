import assert from "node:assert/strict";
import { buildClaudeArgs } from "./claudeCodeAgent.js";

assert.deepEqual(buildClaudeArgs({ allowedTools: "" }), ["-p", "--allowedTools", "", "--output-format", "text"]);

const a = buildClaudeArgs({ allowedTools: "Read,Grep", mcpConfigPath: "/tmp/mcp.json", model: "claude-opus-4-8" });
assert.ok(a.includes("--mcp-config") && a.includes("/tmp/mcp.json"));
assert.ok(a.includes("--allowedTools") && a.includes("Read,Grep"));
assert.ok(a.includes("--model") && a.includes("claude-opus-4-8"));

console.log("claudeCodeAgent.test PASS");
