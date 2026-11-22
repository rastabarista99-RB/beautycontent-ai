import { Card } from "@/components/ui/card";

export function PagePlaceholder({ eyebrow = "Foundation", title, description }: { eyebrow?: string; title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 max-w-2xl text-muted">{description}</p>
      </div>
      <Card className="border-dashed">
        <p className="text-sm text-muted">This screen is ready for the next product phase.</p>
      </Card>
    </div>
  );
}
