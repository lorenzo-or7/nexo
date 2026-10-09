import Image from "next/image";
import { cn } from "@/lib/cn";

/** Símbolo "N" (fita) + logotipo "nexo", com a versão correta para cada tema. */
export function Logo({ className, showWordmark = true, markSize = 36 }: { className?: string; showWordmark?: boolean; markSize?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src="/brand/mark-sm.png" alt="" width={markSize} height={Math.round(markSize * 0.84)} priority className="shrink-0" />
      {showWordmark && (
        <>
          <Image src="/brand/wordmark-on-light.png" alt="NEXO" width={84} height={17} priority className="block h-auto w-[84px] dark:hidden" />
          <Image src="/brand/wordmark-on-dark.png" alt="NEXO" width={84} height={17} priority className="hidden h-auto w-[84px] dark:block" />
        </>
      )}
    </span>
  );
}
