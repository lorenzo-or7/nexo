import * as React from "react";
import { cn } from "@/lib/cn";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-card sm:p-6", className)} {...props} />;
}

export function PanelHeader({ title, action, description }: { title: string; action?: React.ReactNode; description?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[1.0625rem] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {action}
    </header>
  );
}
