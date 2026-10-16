"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Entrada suave ao rolar. O conteúdo já nasce visível (sem JavaScript, ou com movimento
 * reduzido, nada fica escondido): só quem está abaixo da dobra é "armado" depois de montar.
 */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section" | "article" }) {
  const ref = React.useRef<HTMLElement>(null);
  const [state, setState] = React.useState<"idle" | "armed" | "in">("idle");

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as React.ElementType;
  return (
    <Comp ref={ref} data-reveal={state} style={delay ? { transitionDelay: `${delay}ms` } : undefined} className={cn("reveal", className)}>
      {children}
    </Comp>
  );
}
