import type { CompositionSelection } from "@tinker/editor";

/** A scoped reference attached to a chat instruction (matches POST /api/jobs/:id/edits context items). */
export type ChatContextRef = {
  id: string;
  kind: "range" | "clip";
  start: number;
  end: number;
  clipId?: string;
  label?: string;
};

/** Build a ChatContextRef from a timeline selection. `id` must be caller-unique. */
export function chatContextRefFromSelection(selection: CompositionSelection, id: string): ChatContextRef {
  if (selection.kind === "clip") {
    return {
      id, kind: "clip", start: selection.start, end: selection.end, clipId: selection.clipId,
      ...(selection.label === undefined ? {} : { label: selection.label }),
    };
  }
  return { id, kind: "range", start: selection.start, end: selection.end };
}

/** Human-readable chip label, e.g. "4.2s–7.8s" or a clip's label. */
export function formatContextLabel(ref: ChatContextRef): string {
  if (ref.kind === "clip") return ref.label ?? ref.clipId ?? "clip";
  return `${ref.start.toFixed(1)}s–${ref.end.toFixed(1)}s`;
}
