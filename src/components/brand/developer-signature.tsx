import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * Assinatura de autoria (OR7 · Idealizado e desenvolvido por Lorenzo Orsetti).
 * Usa o arquivo original sobre a própria superfície preta da arte, sem filtros: por isso a
 * aparência é idêntica em qualquer modo e paleta. Elemento de rodapé, nunca uma sobreposição.
 */
export function DeveloperSignature({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("flex justify-center", className)}>
      <Image
        src="/brand/or7-assinatura.png"
        alt="Or7 — Idealizado e desenvolvido por Lorenzo Orsetti"
        width={1200}
        height={225}
        sizes={size === "sm" ? "240px" : "(min-width: 640px) 340px, 280px"}
        className={cn(
          "h-auto rounded-xl bg-black ring-1 ring-[rgb(128_128_128/0.4)]",
          size === "sm" ? "w-[240px]" : "w-[280px] sm:w-[340px]",
        )}
      />
    </div>
  );
}
