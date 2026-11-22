"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="w-full max-w-lg rounded-card bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="text-xl font-semibold">{title}</h2>
          <button className={cn("rounded-full p-1 text-muted hover:bg-slate-100")} onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
