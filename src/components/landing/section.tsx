import { cn } from "@/lib/cn";
import { Reveal } from "./reveal";

export function SectionHeading({ eyebrow, title, subtitle, id, className, align = "center" }: { eyebrow?: string; title: string; subtitle?: string; id: string; className?: string; align?: "center" | "left" }) {
  return (
    <Reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>}
      <h2 id={id} className="mt-3 text-balance text-[clamp(1.875rem,5vw,3rem)] font-semibold leading-[1.05] tracking-[-0.04em]">{title}</h2>
      {subtitle && <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-2">{subtitle}</p>}
    </Reveal>
  );
}
