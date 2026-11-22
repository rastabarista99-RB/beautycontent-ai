import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control border border-border bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15",
        className,
      )}
      {...props}
    />
  );
}
