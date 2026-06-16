import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
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

      expect(DEFAULT_CURSOR_IMAGE).toEqual({
        fileName: "cursor-arrow.png",
        width: 32,
        height: 32,
        hotspotX: 3,
        hotspotY: 2,
      });
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
      expectPngStructure(firstBytes);
      expect(createHash("sha256").update(firstBytes).digest("hex")).toBe(
        createHash("sha256").update(secondBytes).digest("hex"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

type PngChunk = {
  type: string;
  data: Buffer;
  crc: number;
  crcInput: Buffer;
};

function expectPngStructure(bytes: Buffer) {
  const chunks = parsePngChunks(bytes);

  expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "IEND"]);

  const ihdr = chunks[0]!;
  expect(ihdr.data.readUInt32BE(0)).toBe(32);
  expect(ihdr.data.readUInt32BE(4)).toBe(32);
  expect(ihdr.data[8]).toBe(8);
  expect(ihdr.data[9]).toBe(6);
  expect(ihdr.data[10]).toBe(0);
  expect(ihdr.data[11]).toBe(0);
  expect(ihdr.data[12]).toBe(0);

  const idat = chunks[1]!;
  const scanlines = inflateSync(idat.data);
  expect(scanlines).toHaveLength(32 * (1 + 32 * 4));
  for (let y = 0; y < 32; y += 1) {
    expect(scanlines[y * (1 + 32 * 4)]).toBe(0);
  }

  for (const chunk of chunks) {
    expect(chunk.crc).toBe(crc32(chunk.crcInput));
  }
}

function parsePngChunks(bytes: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = 8;

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const crcStart = dataEnd;
    const crcEnd = crcStart + 4;

    const type = bytes.toString("ascii", typeStart, dataStart);
    chunks.push({
      type,
      data: bytes.subarray(dataStart, dataEnd),
      crc: bytes.readUInt32BE(crcStart),
      crcInput: bytes.subarray(typeStart, dataEnd),
    });
    offset = crcEnd;
  }

  expect(offset).toBe(bytes.length);
  return chunks;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
