"use client";

import { useActionState, useEffect, useRef } from "react";

import { saveService } from "@/lib/business/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ServiceValues = {
  id?: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
};

export function ServiceForm({ businessId, service, onCancel }: { businessId: string; service?: ServiceValues; onCancel?: () => void }) {
  const [state, formAction, pending] = useActionState(saveService, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      onCancel?.();
    }
  }, [onCancel, state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-control border border-border p-4">
      <input type="hidden" name="businessId" value={businessId} />
      {service?.id && <input type="hidden" name="serviceId" value={service.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Service name
          <Input className="mt-1.5" name="name" defaultValue={service?.name ?? ""} required />
        </label>
        <label className="text-sm font-medium text-ink">
          Price
          <Input className="mt-1.5" name="price" type="number" min="0" step="0.01" defaultValue={service?.price ?? ""} />
        </label>
      </div>
      <label className="block text-sm font-medium text-ink">
        Description
        <Textarea className="mt-1.5 min-h-20" name="description" defaultValue={service?.description ?? ""} />
      </label>
      <label className="block text-sm font-medium text-ink">
        Currency
        <Input className="mt-1.5 max-w-32" name="currency" defaultValue={service?.currency ?? "MDL"} maxLength={3} />
      </label>
      {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : service ? "Save service" : "Add service"}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
