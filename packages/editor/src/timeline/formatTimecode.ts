/** Format seconds as `m:ss.s` (e.g. 3.2 → "0:03.2"). */
export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  const rounded = remainder.toFixed(1);
  const padded = parseFloat(rounded) < 10 ? `0${rounded}` : rounded;
  return `${minutes}:${padded}`;
}
