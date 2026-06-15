import { useCallback, useEffect, useRef, useState } from "react";

export type CompositionPlayback = {
  currentTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  playSegment: (start: number, end: number) => void;
};

/** rAF-driven playhead for the composition preview. Advances `currentTime`, which the preview seeks to. */
export function useCompositionPlayback(duration: number): CompositionPlayback {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const currentRef = useRef(currentTime);
  currentRef.current = currentTime;
  const loopRangeRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isPlaying || typeof requestAnimationFrame !== "function") {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastRef.current = null;
      return;
    }
    function tick(ts: number) {
      if (!mountedRef.current) return;
      if (lastRef.current === null) lastRef.current = ts;
      const delta = (ts - lastRef.current) / 1000;
      lastRef.current = ts;
      const loop = loopRangeRef.current;
      const upper = loop ? loop.end : duration;
      let next = currentRef.current + delta;
      if (next >= upper) {
        if (loop) { next = loop.start; setCurrentTime(next); lastRef.current = ts; rafRef.current = requestAnimationFrame(tick); return; }
        setCurrentTime(upper); setIsPlaying(false); lastRef.current = null; return;
      }
      setCurrentTime(next);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastRef.current = null;
    };
  }, [isPlaying, duration]);

  const play = useCallback(() => {
    loopRangeRef.current = null;
    setCurrentTime((t) => (duration > 0 && t >= duration ? 0 : t));
    setIsPlaying(true);
  }, [duration]);
  const pause = useCallback(() => { setIsPlaying(false); }, []);
  const seek = useCallback(
    (time: number) => { loopRangeRef.current = null; setCurrentTime(Math.max(0, Math.min(time, duration > 0 ? duration : 0))); },
    [duration],
  );
  const playSegment = useCallback((start: number, end: number) => {
    loopRangeRef.current = { start: Math.max(0, start), end: Math.max(start, end) };
    setCurrentTime(Math.max(0, start));
    setIsPlaying(true);
  }, []);

  return { currentTime, isPlaying, play, pause, seek, playSegment };
}
