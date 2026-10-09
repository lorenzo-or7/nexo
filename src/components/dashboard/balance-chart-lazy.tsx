"use client";
import dynamic from "next/dynamic";

/** Recharts é pesado: carrega só no navegador, depois do resto da página. */
export const BalanceChart = dynamic(() => import("./balance-chart").then((m) => m.BalanceChart), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-xl bg-surface-2 sm:h-56" aria-hidden />,
});
