import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-control border border-border bg-white px-3 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15",
        className,
      )}
      {...props}
    />
  );
}
