"use client";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { brandAssets } from "@/lib/theme/palettes";
import { useTheme } from "@/lib/theme/provider";

/** Cada modo tem a própria imagem; o CSS escolhe qual aparece (o menu lateral é sempre escuro). */
function ModeImages({
  kind,
  className,
  width,
  height,
  priority,
  alt,
}: {
  kind: "mark" | "markFull" | "wordmark";
  className?: string;
  width: number;
  height: number;
  priority?: boolean;
  alt: string;
}) {
  const { palette } = useTheme();
  const light = brandAssets(palette, "light")[kind];
  const dark = brandAssets(palette, "dark")[kind];
  if (light === dark) return <Image src={dark} alt={alt} width={width} height={height} priority={priority} className={className} />;
  return (
    <>
      <Image src={light} alt={alt} width={width} height={height} priority={priority} className={cn(className, "dark:hidden")} />
      <Image src={dark} alt={alt} width={width} height={height} priority={priority} className={cn(className, "hidden dark:block")} />
    </>
  );
}

/** Símbolo "N" (fita) + logotipo "nexo", na versão da paleta e do modo ativos. */
export function Logo({ className, showWordmark = true, markSize = 36 }: { className?: string; showWordmark?: boolean; markSize?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ModeImages kind="mark" alt="" width={markSize} height={Math.round(markSize * 0.84)} priority className="shrink-0 object-contain" />
      {showWordmark && <ModeImages kind="wordmark" alt="NEXO" width={84} height={17} priority className="h-auto w-[84px]" />}
    </span>
  );
}

/** Símbolo grande e logotipo da tela de entrada. */
export function BrandImages({ large }: { large: boolean }) {
  return (
    <>
      <div className="relative">
        <ModeImages kind="markFull" alt="" width={440} height={370} priority className={cn("object-contain", large ? "h-auto w-[200px] xl:w-[230px]" : "h-auto w-[64px]")} />
      </div>
      <ModeImages kind="wordmark" alt="NEXO" width={757} height={156} priority className={cn("h-auto", large ? "mt-8 w-[230px] xl:w-[260px]" : "mt-4 w-[120px]")} />
    </>
  );
}
