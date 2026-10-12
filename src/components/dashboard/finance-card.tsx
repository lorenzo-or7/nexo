import { cn } from "@/lib/cn";

/**
 * Face de cartão/conta. A dobra diagonal ecoa a fita do símbolo NEXO
 * em vez de um gradiente genérico; a cor vem da configuração do usuário.
 */
export function FinanceCard({
  color,
  institution,
  title,
  amountLabel,
  amount,
  footer,
  className,
}: {
  color: string;
  institution: string;
  title: string;
  amountLabel: string;
  amount: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative isolate flex aspect-[1.586] w-[17.5rem] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[1.25rem] p-5 text-white shadow-[0_18px_40px_-22px_rgba(36,17,39,0.8)] sm:w-auto",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <svg aria-hidden viewBox="0 0 320 202" preserveAspectRatio="none" className="absolute inset-0 -z-10 h-full w-full">
        <defs>
          <linearGradient id="fold-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.20" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="fold-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.30" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M150 -10 L250 -10 L330 120 L330 215 Z" fill="url(#fold-a)" />
        <path d="M250 -10 L330 -10 L330 120 Z" fill="url(#fold-b)" />
        <path d="M150 -10 L330 215" stroke="#fff" strokeOpacity="0.18" strokeWidth="1" fill="none" />
      </svg>
      <header className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{institution}</span>
          <span className="block truncate text-xs text-white/70">{title}</span>
        </span>
      </header>
      <div>
        <span className="block text-xs text-white/70">{amountLabel}</span>
        <span className="block text-[1.5rem] font-semibold tracking-[-0.02em]">{amount}</span>
        {footer && <span className="mt-1 block text-xs text-white/75">{footer}</span>}
      </div>
    </article>
  );
}
