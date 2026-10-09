import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 text-base text-ink placeholder:text-ink-3",
        "transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none",
        "aria-[invalid=true]:border-negative",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink-2">
          {label}
        </label>
        {hint}
      </div>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-[var(--radius-control)] px-4 py-3 text-sm",
        tone === "error" ? "bg-accent-soft text-negative" : "bg-positive-soft text-positive",
      )}
    >
      {children}
    </div>
  );
}

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-12 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 text-base text-ink",
        "transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});
