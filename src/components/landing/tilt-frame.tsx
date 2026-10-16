"use client";
import * as React from "react";

/** Profundidade sutil: inclina o conteúdo alguns graus seguindo o ponteiro. Só transform; desligado com movimento reduzido ou toque. */
export function TiltFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const enabled = React.useRef(false);

  React.useEffect(() => {
    enabled.current = window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;
  }, []);

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !enabled.current) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1400px) rotateY(${(px * 5).toFixed(2)}deg) rotateX(${(-py * 4).toFixed(2)}deg)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <div onPointerMove={move} onPointerLeave={leave} className={className}>
      <div ref={ref} className="transition-transform duration-300 ease-out will-change-transform">
        {children}
      </div>
    </div>
  );
}
