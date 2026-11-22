import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-white hover:bg-primary-dark",
        variant === "secondary" && "border border-border bg-white text-ink hover:bg-slate-50",
        variant === "ghost" && "text-muted hover:bg-accent-light hover:text-primary-dark",
        variant === "danger" && "bg-error text-white hover:bg-red-600",
        size === "sm" && "min-h-9 px-3 text-sm",
        size === "md" && "min-h-11 px-4 text-sm",
        size === "lg" && "min-h-12 px-6",
        className,
      )}
      {...props}
    />
  );
}
