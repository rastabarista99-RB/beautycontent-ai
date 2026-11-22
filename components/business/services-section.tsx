"use client";

import { useState } from "react";

import { deleteService } from "@/lib/business/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ServiceForm } from "./service-form";

type Service = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
};

export function ServicesSection({ businessId, services }: { businessId: string; services: Service[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(serviceId: string) {
    if (!window.confirm("Delete this service? This cannot be undone.")) return;
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("serviceId", serviceId);
    const result = await deleteService(formData);
    if (result.error) setError(result.error);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">Services</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">What you offer</h2>
          <p className="mt-2 text-sm text-muted">Keep your services available for future content workflows.</p>
        </div>
        <Button type="button" size="sm" onClick={() => { setShowForm(true); setEditingId(null); }}>Add service</Button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-error">{error}</p>}
      {showForm && <div className="mt-5"><ServiceForm businessId={businessId} onCancel={() => setShowForm(false)} /></div>}
      {services.length === 0 && !showForm ? (
        <p className="mt-5 rounded-control border border-dashed border-border p-5 text-sm text-muted">No services yet. Add your first service to complete your profile.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {services.map((service) => editingId === service.id ? (
            <ServiceForm key={service.id} businessId={businessId} service={service} onCancel={() => setEditingId(null)} />
          ) : (
            <div key={service.id} className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-border p-4">
              <div>
                <h3 className="font-medium text-ink">{service.name}</h3>
                {service.description && <p className="mt-1 text-sm text-muted">{service.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                {service.price !== null && <span className="text-sm font-medium text-ink">{service.price} {service.currency}</span>}
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(service.id); setShowForm(false); }}>Edit</Button>
                <Button type="button" variant="danger" size="sm" onClick={() => handleDelete(service.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
