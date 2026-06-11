import type { CursorEvent, DemoProject, ZoomKeyframe } from "@tinker/project-schema";

export type ActivePreviewOverlays = {
  zooms: ZoomKeyframe[];
  cursorEvents: CursorEvent[];
  latestCursor?: CursorEvent;
};

function isActiveRange(item: { start: number; end: number }, time: number) {
  return item.start <= time && time < item.end;
}

function findLatestCursorEvent(sortedCursorEvents: CursorEvent[], time: number) {
  for (let index = sortedCursorEvents.length - 1; index >= 0; index -= 1) {
    const event = sortedCursorEvents[index];

    if (event.time <= time && (event.type === "move" || event.type === "click")) {
      return event;
    }
  }

  return undefined;
}

export function getActivePreviewOverlays(
  project: DemoProject,
  time: number,
  options: { cursorEventToleranceSeconds?: number } = {},
): ActivePreviewOverlays {
  const cursorEventToleranceSeconds = options.cursorEventToleranceSeconds ?? 0.5;
  const sortedCursorEvents = [...project.cursorEvents].sort((left, right) => left.time - right.time);

  return {
    zooms: project.zooms.filter((zoom) => isActiveRange(zoom, time)),
    cursorEvents: sortedCursorEvents.filter((event) => Math.abs(event.time - time) <= cursorEventToleranceSeconds),
    latestCursor: findLatestCursorEvent(sortedCursorEvents, time),
  };
}
