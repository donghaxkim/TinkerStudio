import type { DemoProject } from "@tinker/project-schema";

export type TimelineItemKind = "clip" | "caption" | "zoom" | "callout";
export type TimelineRowKind = "track" | "captions" | "zooms" | "callouts";

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
      id: "captions",
      kind: "captions",
      label: "Captions",
      items: project.captions.map((caption, index) => ({
        id: caption.id,
        kind: "caption",
        label: caption.text || formatFallbackLabel("caption", index),
        start: caption.start,
        end: caption.end,
        rowId: "captions",
      })),
    },
    {
      id: "zooms",
      kind: "zooms",
      label: "Zooms",
      items: project.zooms.map((zoom, index) => ({
        id: zoom.id,
        kind: "zoom",
        label: `Zoom ${index + 1}`,
        start: zoom.start,
        end: zoom.end,
        rowId: "zooms",
      })),
    },
    {
      id: "callouts",
      kind: "callouts",
      label: "Callouts",
      items: project.callouts.map((callout, index) => ({
        id: callout.id,
        kind: "callout",
        label: callout.text || formatFallbackLabel("callout", index),
        start: callout.start,
        end: callout.end,
        rowId: "callouts",
      })),
    },
  ];
}
