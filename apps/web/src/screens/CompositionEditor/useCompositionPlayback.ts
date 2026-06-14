import { useCallback, useEffect, useRef, useState } from "react";

export type CompositionPlayback = {
  currentTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
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
      const next = Math.min(currentRef.current + delta, duration);
      setCurrentTime(next);
      if (next >= duration) { setIsPlaying(false); lastRef.current = null; return; }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastRef.current = null;
    };
  }, [isPlaying, duration]);

  const play = useCallback(() => {
    setCurrentTime((t) => (duration > 0 && t >= duration ? 0 : t));
    setIsPlaying(true);
  }, [duration]);
  const pause = useCallback(() => setIsPlaying(false), []);
  const seek = useCallback(
    (time: number) => setCurrentTime(Math.max(0, Math.min(time, duration > 0 ? duration : 0))),
    [duration],
  );

  return { currentTime, isPlaying, play, pause, seek };
}
