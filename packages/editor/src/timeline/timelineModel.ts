import type { DemoProject } from "@tinker/project-schema";

export type TimelineItemKind = "clip" | "zoom";
export type TimelineRowKind = "track" | "zooms";

export type TimelineItem = {
  id: string;
  kind: TimelineItemKind;
  label: string;
  start: number;
  end: number;
  rowId: string;
};

export type TimelineRow = {
  id: string;
  kind: TimelineRowKind;
  label: string;
  items: TimelineItem[];
};

function formatFallbackLabel(kind: TimelineItemKind, index: number) {
  return `${kind} ${index + 1}`;
}

export function buildTimelineRows(project: DemoProject): TimelineRow[] {
  const trackRows = project.tracks.map<TimelineRow>((track) => ({
    id: track.id,
    kind: "track",
    label: track.name,
    items: track.clips.map((clip, index) => ({
      id: clip.id,
      kind: "clip",
      label: clip.name ?? clip.assetId ?? formatFallbackLabel("clip", index),
      start: clip.start,
      end: clip.end,
      rowId: track.id,
    })),
  }));

  return [
    ...trackRows,
    {
      id: "zooms",
      kind: "zooms",
      label: "Zooms",
      items: project.zooms.map((zoom, index) => ({
        id: zoom.id,
        kind: "zoom",
        label: zoom.name ?? `Zoom ${index + 1}`,
        start: zoom.start,
        end: zoom.end,
        rowId: "zooms",
      })),
    },
  ];
}
