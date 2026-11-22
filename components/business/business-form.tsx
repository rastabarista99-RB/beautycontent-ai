"use client";

import { useActionState, useEffect, useRef } from "react";

import { saveBusiness, type BusinessActionState } from "@/lib/business/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type BusinessValues = {
  name: string;
  city: string;
  description: string;
  target_audience: string;
  tone_of_voice: string;
  brand_advantages: string;
  preferred_phrases: string;
  forbidden_phrases: string;
};

const initialState: BusinessActionState = {};

export function BusinessForm({ business }: { business: BusinessValues | null }) {
  const [state, formAction, pending] = useActionState(saveBusiness, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <Card>
      <div className="mb-6">
        <p className="text-sm font-medium text-primary">{business ? "Business profile" : "Get started"}</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink">{business ? "Your business details" : "Set up your business"}</h2>
        <p className="mt-2 text-sm text-muted">These details help keep future content aligned with your business.</p>
      </div>
      <form ref={formRef} action={formAction} className="grid gap-4 md:grid-cols-2">
        <Field label="Business name" name="name" defaultValue={business?.name} required />
        <Field label="City" name="city" defaultValue={business?.city} />
        <TextField label="Description" name="description" defaultValue={business?.description} />
        <TextField label="Target audience" name="targetAudience" defaultValue={business?.target_audience} />
        <TextField label="Tone of voice" name="toneOfVoice" defaultValue={business?.tone_of_voice} />
        <TextField label="Brand advantages" name="brandAdvantages" defaultValue={business?.brand_advantages} />
        <TextField label="Preferred phrases" name="preferredPhrases" defaultValue={business?.preferred_phrases} />
        <TextField label="Forbidden phrases" name="forbiddenPhrases" defaultValue={business?.forbidden_phrases} />
        {state.error && <p role="alert" className="md:col-span-2 text-sm text-error">{state.error}</p>}
        {state.success && <p role="status" className="md:col-span-2 text-sm text-success">Business profile saved.</p>}
        <div className="md:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save business profile"}</Button>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, name, defaultValue, required }: { label: string; name: string; defaultValue?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <Input className="mt-1.5" name={name} defaultValue={defaultValue ?? ""} required={required} />
    </label>
  );
}

function TextField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <Textarea className="mt-1.5 min-h-24" name={name} defaultValue={defaultValue ?? ""} />
    </label>
  );
}
