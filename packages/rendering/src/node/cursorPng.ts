import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

export type CursorImage = {
  path: string;
  width: number;
  height: number;
  hotspotX: number;
  hotspotY: number;
};

export const DEFAULT_CURSOR_IMAGE = {
  fileName: "cursor-arrow.png",
  width: 32,
  height: 32,
  hotspotX: 3,
  hotspotY: 2,
} as const;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ARROW_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [3, 2],
  [3, 25],
  [9, 19],
  [13, 30],
  [18, 28],
  [14, 17],
  [23, 17],
];

export async function writeDefaultCursorPng(directory: string): Promise<CursorImage> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, DEFAULT_CURSOR_IMAGE.fileName);
  await writeFile(path, buildCursorPng());

  return {
    path,
    width: DEFAULT_CURSOR_IMAGE.width,
    height: DEFAULT_CURSOR_IMAGE.height,
    hotspotX: DEFAULT_CURSOR_IMAGE.hotspotX,
    hotspotY: DEFAULT_CURSOR_IMAGE.hotspotY,
  };
}

function buildCursorPng() {
  const pixels = Buffer.alloc(DEFAULT_CURSOR_IMAGE.width * DEFAULT_CURSOR_IMAGE.height * 4);
  drawPolygon(pixels, offsetPolygon(ARROW_POLYGON, 2, 2), [0, 0, 0, 90]);
  drawPolygon(pixels, offsetPolygon(ARROW_POLYGON, -1, 0), [15, 23, 42, 255]);
  drawPolygon(pixels, offsetPolygon(ARROW_POLYGON, 1, 0), [15, 23, 42, 255]);
  drawPolygon(pixels, offsetPolygon(ARROW_POLYGON, 0, -1), [15, 23, 42, 255]);
  drawPolygon(pixels, offsetPolygon(ARROW_POLYGON, 0, 1), [15, 23, 42, 255]);
  drawPolygon(pixels, ARROW_POLYGON, [248, 250, 252, 255]);

  const scanlines = Buffer.alloc(DEFAULT_CURSOR_IMAGE.height * (1 + DEFAULT_CURSOR_IMAGE.width * 4));
  for (let y = 0; y < DEFAULT_CURSOR_IMAGE.height; y += 1) {
    const sourceStart = y * DEFAULT_CURSOR_IMAGE.width * 4;
    const targetStart = y * (1 + DEFAULT_CURSOR_IMAGE.width * 4) + 1;
    pixels.copy(scanlines, targetStart, sourceStart, sourceStart + DEFAULT_CURSOR_IMAGE.width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(DEFAULT_CURSOR_IMAGE.width, 0);
  ihdr.writeUInt32BE(DEFAULT_CURSOR_IMAGE.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawPolygon(pixels: Buffer, polygon: ReadonlyArray<readonly [number, number]>, color: readonly [number, number, number, number]) {
  for (let y = 0; y < DEFAULT_CURSOR_IMAGE.height; y += 1) {
    for (let x = 0; x < DEFAULT_CURSOR_IMAGE.width; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) {
        const offset = (y * DEFAULT_CURSOR_IMAGE.width + x) * 4;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = color[3];
      }
    }
  }
}

function offsetPolygon(polygon: ReadonlyArray<readonly [number, number]>, dx: number, dy: number) {
  return polygon.map(([x, y]) => [x + dx, y + dy] as const);
}

function pointInPolygon(x: number, y: number, polygon: ReadonlyArray<readonly [number, number]>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
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
