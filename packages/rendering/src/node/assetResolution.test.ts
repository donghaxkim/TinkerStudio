import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DemoProjectSchema, EDGE_CASE_DEMO_PROJECT_FIXTURES, type Asset, type DemoProject } from "@tinker/project-schema";
import sampleProjectInput from "../../../project-schema/fixtures/demo-project.sample.json" with { type: "json" };
import {
  AssetResolutionError,
  preflightExportAssets,
  resolveNodeAssetFilePath,
} from "./assetResolution.js";

async function withProjectRoot<T>(run: (projectRoot: string) => Promise<T>) {
  const projectRoot = await mkdtemp(join(tmpdir(), "tinker-assets-"));

  try {
    return await run(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function videoAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset_video",
    type: "video",
    uri: "capture/video.mp4",
    source: "captured",
    mimeType: "video/mp4",
    metadata: {},
    ...overrides,
  };
}

function edgeFixture(id: string) {
  const fixture = EDGE_CASE_DEMO_PROJECT_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Missing edge-case fixture '${id}'`);
  return fixture;
}

describe("node asset resolution", () => {
  it("resolves a valid local video relative to the explicit project root", async () => {
    await withProjectRoot(async (projectRoot) => {
      await mkdir(join(projectRoot, "capture"), { recursive: true });
      await writeFile(join(projectRoot, "capture/video.mp4"), "fake video bytes");

      await expect(resolveNodeAssetFilePath(videoAsset(), { projectRoot, consumer: "export" })).resolves.toEqual(
        expect.objectContaining({
          ok: true,
          assetId: "asset_video",
          assetUri: "capture/video.mp4",
          consumer: "export",
          path: join(projectRoot, "capture/video.mp4"),
        }),
      );
    });
  });

  it("rejects missing files before export", async () => {
    await withProjectRoot(async (projectRoot) => {
      await expect(resolveNodeAssetFilePath(videoAsset(), { projectRoot, consumer: "export" })).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({
          code: "missing_file",
          assetId: "asset_video",
          assetUri: "capture/video.mp4",
          consumer: "export",
        }),
      });
    });
  });

  it("rejects unsupported remote schemes for local export", async () => {
    await withProjectRoot(async (projectRoot) => {
      await expect(resolveNodeAssetFilePath(videoAsset({ uri: "https://example.com/video.mp4", source: "remote" }), { projectRoot, consumer: "export" })).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({
          code: "unsupported_scheme",
          assetId: "asset_video",
          assetUri: "https://example.com/video.mp4",
          consumer: "export",
        }),
      });
    });
  });

  it("rejects path traversal outside approved roots", async () => {
    await withProjectRoot(async (projectRoot) => {
      await expect(resolveNodeAssetFilePath(videoAsset({ uri: "../outside.mp4" }), { projectRoot, consumer: "export" })).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({
          code: "path_traversal",
          assetId: "asset_video",
          assetUri: "../outside.mp4",
          consumer: "export",
        }),
      });
    });
  });

  it("rejects symlinks inside approved roots that target files outside approved roots", async () => {
    await withProjectRoot(async (projectRoot) => {
      const outsideRoot = await mkdtemp(join(tmpdir(), "tinker-assets-outside-"));

      try {
        await mkdir(join(projectRoot, "capture"), { recursive: true });
        await writeFile(join(outsideRoot, "outside.mp4"), "fake video bytes");
        await symlink(join(outsideRoot, "outside.mp4"), join(projectRoot, "capture/link.mp4"));

        await expect(resolveNodeAssetFilePath(videoAsset({ uri: "capture/link.mp4" }), { projectRoot, consumer: "export" })).resolves.toEqual({
          ok: false,
          error: expect.objectContaining({
            code: "path_traversal",
            assetId: "asset_video",
            assetUri: "capture/link.mp4",
            consumer: "export",
          }),
        });
      } finally {
        await rm(outsideRoot, { recursive: true, force: true });
      }
    });
  });

  it("rejects malformed file URLs for local export", async () => {
    await withProjectRoot(async (projectRoot) => {
      await expect(resolveNodeAssetFilePath(videoAsset({ uri: "file://not-localhost/capture.mp4" }), { projectRoot, consumer: "export" })).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({
          code: "unsupported_scheme",
          assetId: "asset_video",
          assetUri: "file://not-localhost/capture.mp4",
          consumer: "export",
        }),
      });
    });
  });

  it("rejects type and MIME mismatches", async () => {
    await withProjectRoot(async (projectRoot) => {
      await mkdir(join(projectRoot, "capture"), { recursive: true });
      await writeFile(join(projectRoot, "capture/video.mp4"), "fake video bytes");

      await expect(resolveNodeAssetFilePath(videoAsset({ type: "image" }), { projectRoot, consumer: "export" })).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({ code: "type_mismatch", assetId: "asset_video", consumer: "export" }),
      });
      await expect(resolveNodeAssetFilePath(videoAsset({ mimeType: "image/png" }), { projectRoot, consumer: "export" })).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({ code: "mime_mismatch", assetId: "asset_video", consumer: "export" }),
      });
    });
  });

  it("preflights every source video asset used by export clips", async () => {
    await withProjectRoot(async (projectRoot) => {
      const project = {
        ...sampleProjectInput,
        assets: sampleProjectInput.assets.map((asset) => ({ ...asset, uri: "missing/capture.mp4" })),
      } as DemoProject;

      await expect(preflightExportAssets(project, { projectRoot, consumer: "export" })).rejects.toBeInstanceOf(AssetResolutionError);
      await expect(preflightExportAssets(project, { projectRoot, consumer: "export" })).rejects.toMatchObject({
        issues: [expect.objectContaining({ code: "missing_file", assetId: "asset_capture_001" })],
      });
    });
  });

  it("reports the missing asset edge fixture as a structured asset resolution error", async () => {
    const fixture = edgeFixture("missing_asset");

    await withProjectRoot(async (projectRoot) => {
      await expect(preflightExportAssets(fixture.project, { projectRoot, consumer: "export" })).rejects.toBeInstanceOf(AssetResolutionError);
      await expect(preflightExportAssets(fixture.project, { projectRoot, consumer: "export" })).rejects.toMatchObject({
        issues: [expect.objectContaining({ code: "missing_file", assetId: "asset_capture_001", consumer: "export" })],
      });
    });
  });

  it("reports the invalid asset reference edge fixture as a schema assetId issue", () => {
    const fixture = edgeFixture("invalid_asset_reference");
    const parsed = DemoProjectSchema.safeParse(fixture.project);

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected invalid asset reference fixture to fail schema validation");
    expect(parsed.error.issues.some((issue) => issue.path.join(".").endsWith("assetId"))).toBe(true);
  });
});
