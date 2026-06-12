import type { Asset, Clip, DemoProject } from "@tinker/project-schema";

export type AssetResolutionIssueCode =
  | "unsupported_scheme"
  | "type_mismatch";

export type AssetResolutionIssue = {
  code: AssetResolutionIssueCode;
  assetId?: string;
  assetUri?: string;
  consumer: string;
  message: string;
};

export type BrowserAssetResolution =
  | { ok: true; assetId: string; consumer: string; url: string; kind: "video" | "image" }
  | { ok: false; error: AssetResolutionIssue };

const BROWSER_RENDERABLE_PROTOCOLS = new Set(["http:", "https:", "data:", "blob:"]);
const BROWSER_RENDERABLE_ASSET_TYPES = new Set(["video", "image"]);
const BROWSER_PREVIEW_FIXTURE_URLS: Record<string, string> = {
  "assets/capture-001.mp4": new URL("../../../project-schema/fixtures/assets/capture-001.mp4", import.meta.url).href,
  "assets/driftboard-dashboard.png": new URL("../../../project-schema/fixtures/assets/driftboard-dashboard.png", import.meta.url).href,
};

export function getAssetById(project: DemoProject, assetId: string): Asset | undefined {
  return project.assets.find((asset) => asset.id === assetId);
}

export function getPrimaryClip(project: DemoProject): { clip: Clip; asset?: Asset } | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.start <= project.duration && candidate.end > 0);
    if (clip) {
      return { clip, asset: getAssetById(project, clip.assetId) };
    }
  }

  return undefined;
}

export function getActiveClip(project: DemoProject, currentTime: number): { clip: Clip; asset?: Asset } | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.start <= currentTime && currentTime < candidate.end);

    if (clip) {
      return { clip, asset: getAssetById(project, clip.assetId) };
    }
  }

  return getPrimaryClip(project);
}

export function getClipSourceTime(clip: Clip, currentTime: number) {
  return Math.max(0, clip.sourceStart + (currentTime - clip.start));
}

export function isBrowserRenderableMedia(asset: Asset | undefined): boolean {
  if (!asset) {
    return false;
  }

  return resolveBrowserPreviewAsset(asset, "preview").ok;
}

export function resolveBrowserPreviewAsset(asset: Asset, consumer: string): BrowserAssetResolution {
  if (!BROWSER_RENDERABLE_ASSET_TYPES.has(asset.type)) {
    return {
      ok: false,
      error: {
        code: "type_mismatch",
        assetId: asset.id,
        assetUri: asset.uri,
        consumer,
        message: `Asset '${asset.id}' is type '${asset.type}', but ${consumer} requires a video or image asset`,
      },
    };
  }

  const kind: "video" | "image" = asset.type === "image" ? "image" : "video";
  const protocol = getUriProtocol(asset.uri);
  const fixtureUrl = resolveBrowserPreviewFixtureUrl(asset.uri);

  if (fixtureUrl) {
    return {
      ok: true,
      assetId: asset.id,
      consumer,
      url: fixtureUrl,
      kind,
    };
  }

  if (!protocol || !BROWSER_RENDERABLE_PROTOCOLS.has(protocol)) {
    return {
      ok: false,
      error: {
        code: "unsupported_scheme",
        assetId: asset.id,
        assetUri: asset.uri,
        consumer,
        message: `Asset '${asset.id}' uses '${asset.uri}', which is not browser-renderable in ${consumer}`,
      },
    };
  }

  return {
    ok: true,
    assetId: asset.id,
    consumer,
    url: asset.uri,
    kind,
  };
}

function resolveBrowserPreviewFixtureUrl(uri: string) {
  return BROWSER_PREVIEW_FIXTURE_URLS[uri];
}

function getUriProtocol(uri: string) {
  try {
    return new URL(uri).protocol;
  } catch {
    return undefined;
  }
}
