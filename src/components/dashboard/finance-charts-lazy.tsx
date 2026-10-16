"use client";
import dynamic from "next/dynamic";

/** Recharts é pesado: carrega só no navegador, depois do resto da página. */
export const FinanceCharts = dynamic(() => import("./finance-charts").then((m) => m.FinanceCharts), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-surface-2" aria-hidden />,
});
