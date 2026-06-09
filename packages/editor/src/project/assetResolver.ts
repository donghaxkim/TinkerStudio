import type { Asset, Clip, DemoProject } from "@tinker/project-schema";

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

  return asset.uri.startsWith("http://") || asset.uri.startsWith("https://") || asset.uri.startsWith("data:") || asset.uri.startsWith("blob:");
}
