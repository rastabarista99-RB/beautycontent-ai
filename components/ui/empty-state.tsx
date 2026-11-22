import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-white px-6 py-12 text-center">
      <Inbox className="mb-3 text-primary" size={28} />
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
