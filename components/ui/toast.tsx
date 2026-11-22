"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  onClose?: () => void;
  variant?: "success" | "error" | "info";
}

export function Toast({ message, onClose, variant = "info" }: ToastProps) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-control border bg-white px-4 py-3 text-sm shadow-lg",
      variant === "success" && "border-success/30 text-emerald-700",
      variant === "error" && "border-error/30 text-red-700",
      variant === "info" && "border-info/30 text-blue-700",
    )} role="status">
      <span>{message}</span>
      {onClose && <button onClick={onClose} aria-label="Close notification"><X size={16} /></button>}
    </div>
  );
}
