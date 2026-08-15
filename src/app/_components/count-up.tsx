"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 550;

/**
 * Animates from the previous value to the new one whenever `value` changes.
 * Engagement counts only move when `advanceTicks` returns, so the tween is what
 * makes a jump in sim time legible as "this post earned that".
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    let start: number | null = null;

    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      // ease-out so the number settles rather than stopping dead
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else fromRef.current = value;
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
