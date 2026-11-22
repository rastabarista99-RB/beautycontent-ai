import { BusinessForm } from "@/components/business/business-form";
import { ServicesSection } from "@/components/business/services-section";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  if (claimsError || !userId) {
    return <p role="alert" className="text-sm text-error">Your session has expired. Please sign in again.</p>;
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, city, description, target_audience, tone_of_voice, brand_advantages, preferred_phrases, forbidden_phrases")
    .eq("user_id", userId)
    .maybeSingle();

  if (businessError) {
    return <p role="alert" className="text-sm text-error">We could not load your business profile. Please try again.</p>;
  }

  const { data: services, error: servicesError } = business
    ? await supabase
        .from("services")
        .select("id, name, description, price, currency")
        .eq("business_id", business.id)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (servicesError) {
    return <p role="alert" className="text-sm text-error">We could not load your services. Please try again.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Business profile</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Your business</h1>
        <p className="mt-2 max-w-2xl text-muted">Keep your business details and services in one place.</p>
      </div>
      <BusinessForm business={business} />
      {business ? <ServicesSection businessId={business.id} services={services ?? []} /> : (
        <p className="rounded-card border border-dashed border-border p-5 text-sm text-muted">Save your business profile to start adding services.</p>
      )}
    </div>
  );
}
