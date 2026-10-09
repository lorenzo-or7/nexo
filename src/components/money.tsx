import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";

/** Valor monetário com tom semântico opcional. */
export function Money({
  value,
  tone = "neutral",
  signed,
  className,
}: {
  value: Cents | number;
  tone?: "neutral" | "flow";
  signed?: boolean;
  className?: string;
}) {
  const color = tone === "flow" ? (value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-ink-3") : undefined;
  return <span className={cn("tabular whitespace-nowrap", color, className)}>{formatBRL(value as Cents, { signed })}</span>;
}
