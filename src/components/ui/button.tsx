import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

const button = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "btn-primary",
        accent: "btn-glow",
        outline: "border border-border-strong bg-field/60 text-ink hover:border-accent/60 hover:bg-surface-2",
        ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        danger: "border border-[color-mix(in_oklab,var(--negative)_40%,transparent)] text-negative hover:bg-accent-soft",
      },
      size: {
        sm: "h-9 rounded-[0.65rem] px-3 text-sm",
        md: "h-11 rounded-[var(--radius-control)] px-4 text-[0.9375rem]",
        lg: "h-12 rounded-[var(--radius-control)] px-5 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
