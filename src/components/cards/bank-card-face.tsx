/* eslint-disable @next/next/no-img-element -- imagens vêm de URLs assinadas e temporárias do Storage */
import { Nfc } from "lucide-react";
import { bankByKey, brandLabel, inkFor, shadeHex } from "@/domain/banks";
import { cn } from "@/lib/cn";

export interface CardFaceData {
  name: string;
  institutionKey: string | null;
  institutionName: string | null;
  brand: string;
  lastFour: string | null;
  color: string;
  logoUrl?: string | null;
  artUrl?: string | null;
}

/**
 * Frente do cartão. Com "arte" enviada pelo usuário, a imagem ocupa o cartão
 * inteiro (ex.: foto do cartão oficial) e só os dados ficam por cima.
 * Sem arte, desenha um cartão genérico nas cores da instituição.
 */
export function BankCardFace({
  card,
  variant = "credit",
  className,
  size = "md",
}: {
  card: CardFaceData;
  variant?: "credit" | "account";
  className?: string;
  size?: "sm" | "md";
}) {
  const preset = bankByKey(card.institutionKey);
  const base = card.color || preset.color;
  const isPresetColor = base.toUpperCase() === preset.color.toUpperCase();
  const shade = isPresetColor ? preset.shade : shadeHex(base, -0.55);
  const ink = card.artUrl ? "#FFFFFF" : isPresetColor ? preset.ink : inkFor(base);
  const institution = card.institutionName || (preset.key !== "outro" ? preset.name : "");
  const pad = size === "sm" ? "p-4" : "p-5";

  return (
    <div
      className={cn(
        "relative isolate aspect-[1.586] w-full overflow-hidden rounded-[18px] select-none",
        "shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_22px_40px_-24px_rgba(20,8,24,0.85)]",
        className,
      )}
      style={{ color: ink, background: card.artUrl ? "#111" : `linear-gradient(135deg, ${base} 0%, ${shade} 100%)` }}
      role="img"
      aria-label={`${variant === "credit" ? "Cartão" : "Conta"} ${card.name}${institution ? `, ${institution}` : ""}${card.lastFour ? `, final ${card.lastFour}` : ""}`}
    >
      {card.artUrl ? (
        <>
          <img src={card.artUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        </>
      ) : (
        <>
          {/* brilho e dobra discretos — superfície, não decoração */}
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,255,255,0.22),transparent_55%)]" />
          <svg aria-hidden viewBox="0 0 320 202" preserveAspectRatio="none" className="absolute inset-0 -z-10 h-full w-full opacity-60">
            <path d="M185 0 L320 0 L320 202 L250 202 Z" fill="rgba(255,255,255,0.06)" />
            <path d="M250 202 L320 92 L320 202 Z" fill="rgba(0,0,0,0.12)" />
          </svg>
        </>
      )}

      <div className={cn("flex h-full flex-col justify-between", pad)}>
        <div className="flex items-start justify-between gap-3">
          {card.logoUrl ? (
            <img src={card.logoUrl} alt={institution || "Logo"} className="h-7 max-w-[55%] object-contain object-left drop-shadow-sm" />
          ) : (
            <span className="truncate text-[0.9375rem] font-semibold tracking-tight">{card.artUrl ? "" : institution}</span>
          )}
          {variant === "credit" && !card.artUrl && <Nfc className="size-6 shrink-0 rotate-90 opacity-80" strokeWidth={1.6} aria-hidden />}
        </div>

        {variant === "credit" && !card.artUrl && <Chip />}

        <div className="flex items-end justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-xs opacity-80">{card.name}</span>
            {card.lastFour && <span className="tabular block text-sm font-medium tracking-[0.12em]">•••• {card.lastFour}</span>}
          </span>
          {variant === "credit" && card.brand !== "other" && (
            <span className="shrink-0 text-xs font-semibold opacity-90">{brandLabel(card.brand)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Chip EMV genérico. */
function Chip() {
  return (
    <svg viewBox="0 0 46 36" className="h-8 w-10" aria-hidden>
      <defs>
        <linearGradient id="chip-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4E2B0" />
          <stop offset="0.5" stopColor="#D9B76A" />
          <stop offset="1" stopColor="#B8934A" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="45" height="35" rx="6" fill="url(#chip-g)" stroke="rgba(0,0,0,0.25)" />
      <path d="M0 12 H15 M0 24 H15 M31 12 H46 M31 24 H46 M15 0 V36 M31 0 V36 M15 18 H31" stroke="rgba(80,55,15,0.45)" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
