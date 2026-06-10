export type TimeScale = {
  duration: number;
  width: number;
  secondsToPixels: (seconds: number) => number;
  pixelsToSeconds: (pixels: number) => number;
  clampTime: (seconds: number) => number;
};

export function createTimeScale(duration: number, width: number): TimeScale {
  const safeDuration = Math.max(0, duration);
  const safeWidth = Math.max(1, width);

  const clampTime = (seconds: number) => Math.min(safeDuration, Math.max(0, seconds));

  return {
    duration: safeDuration,
    width: safeWidth,
    secondsToPixels: (seconds) => (clampTime(seconds) / Math.max(1, safeDuration)) * safeWidth,
    pixelsToSeconds: (pixels) => clampTime((Math.max(0, pixels) / safeWidth) * safeDuration),
    clampTime,
  };
}
