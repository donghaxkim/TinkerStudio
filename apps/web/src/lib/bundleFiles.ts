const CANONICAL_NAMES = new Set(["index.html", "output.mp4", "generation-manifest.json", "asset-manifest.json"]);

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function isRevision(path: string): boolean {
  return path.split("/").includes("revisions");
}

/**
 * Filters a dropped/selected folder's files down to the canonical HyperFrames bundle,
 * remapping each surviving path to a server-canonical `hyperframes/...` path. Picks the
 * shortest `index.html` (skipping `revisions/`), then keeps the sibling output.mp4,
 * manifests, and any `assets/` files that live under that same directory.
 */
export function selectCanonicalBundleFiles<T extends { relativePath: string }>(
  files: T[],
): Array<{ relativePath: string; source: T }> {
  const usable = files
    .map((source) => ({ source, path: normalize(source.relativePath) }))
    .filter((f) => !isRevision(f.path));

  const indexCandidate = usable
    .filter(
      (f) =>
        f.path === "hyperframes/index.html" ||
        f.path.endsWith("/hyperframes/index.html") ||
        f.path === "index.html" ||
        f.path.endsWith("/index.html"),
    )
    .sort((a, b) => a.path.length - b.path.length)[0];
  if (indexCandidate === undefined) return [];

  // The directory prefix that holds index.html (everything up to and including its folder).
  const baseDir = indexCandidate.path.slice(0, indexCandidate.path.length - "index.html".length);

  const out: Array<{ relativePath: string; source: T }> = [];
  for (const f of usable) {
    if (!f.path.startsWith(baseDir)) continue;
    const rel = f.path.slice(baseDir.length); // "index.html", "output.mp4", "assets/logo.png", ...
    if (CANONICAL_NAMES.has(rel) || rel.startsWith("assets/")) {
      out.push({ relativePath: `hyperframes/${rel}`, source: f.source });
    }
  }
  return out;
}
