import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CURSOR_IMAGE, writeDefaultCursorPng } from "./cursorPng.js";

describe("cursor PNG generation", () => {
  it("writes a deterministic transparent PNG with hotspot metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinker-cursor-png-test-"));

    try {
      const first = await writeDefaultCursorPng(root);
      const firstBytes = await readFile(first.path);
      const second = await writeDefaultCursorPng(root);
      const secondBytes = await readFile(second.path);

      expect(first).toEqual({
        path: join(root, "cursor-arrow.png"),
        width: DEFAULT_CURSOR_IMAGE.width,
        height: DEFAULT_CURSOR_IMAGE.height,
        hotspotX: DEFAULT_CURSOR_IMAGE.hotspotX,
        hotspotY: DEFAULT_CURSOR_IMAGE.hotspotY,
      });
      expect(firstBytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(firstBytes.readUInt32BE(16)).toBe(DEFAULT_CURSOR_IMAGE.width);
      expect(firstBytes.readUInt32BE(20)).toBe(DEFAULT_CURSOR_IMAGE.height);
      expect(createHash("sha256").update(firstBytes).digest("hex")).toBe(
        createHash("sha256").update(secondBytes).digest("hex"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
