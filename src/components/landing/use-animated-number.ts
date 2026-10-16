"use client";
import * as React from "react";

/** Anima um número até o alvo (easing suave). Com movimento reduzido, vai direto. */
export function useAnimatedNumber(target: number, duration = 520): number {
  const [value, setValue] = React.useState(target);
  const valueRef = React.useRef(target);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const from = valueRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      valueRef.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
