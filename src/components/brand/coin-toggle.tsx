"use client";
import { motion, useReducedMotion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { useTheme } from "@/lib/theme/provider";
import { cn } from "@/lib/cn";

/**
 * Alternador de tema em forma de moeda: gira uma volta e meia no eixo Y
 * e "cai" do outro lado — lua no verso escuro, sol no verso claro.
 */
export function CoinToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const reduce = useReducedMotion();
  const [turns, setTurns] = React.useState(theme === "dark" ? 0 : 1);
  const next = theme === "dark" ? "claro" : "escuro";

  return (
    <button
      type="button"
      onClick={() => {
        setTurns((t) => t + 1);
        toggle();
      }}
      aria-label={`Ativar modo ${next}`}
      title={`Ativar modo ${next}`}
      className={cn("group relative size-10 shrink-0 rounded-full [perspective:400px]", className)}
    >
      <motion.span
        className="absolute inset-0 [transform-style:preserve-3d]"
        animate={{ rotateY: turns * 180 + (reduce ? 0 : turns * 360) }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 14, mass: 0.9 }}
      >
        {/* face escura */}
        <span className="absolute inset-0 grid place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#4a2850,#241127_70%)] shadow-[inset_0_0_0_2px_rgba(242,92,141,0.55),inset_0_-3px_6px_rgba(0,0,0,0.4),0_4px_12px_-4px_rgba(36,17,39,0.6)] [backface-visibility:hidden]">
          <Moon className="size-[18px] text-rose" strokeWidth={2.2} />
        </span>
        {/* face clara */}
        <span className="absolute inset-0 grid place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#f7edf3_70%)] shadow-[inset_0_0_0_2px_rgba(194,15,73,0.45),inset_0_-3px_6px_rgba(194,15,73,0.12),0_4px_12px_-4px_rgba(36,17,39,0.25)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <Sun className="size-[18px] text-crimson" strokeWidth={2.2} />
        </span>
      </motion.span>
    </button>
  );
}
