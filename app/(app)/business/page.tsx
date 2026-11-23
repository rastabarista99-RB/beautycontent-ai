import { BusinessForm } from "@/components/business/business-form";
import { ServicesSection } from "@/components/business/services-section";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const session = await getSession();
  const userId = session?.userId ?? null;

  if (!userId) {
    return <p role="alert" className="text-sm text-error">Your session has expired. Please sign in again.</p>;
  }

  let business;
  try {
    business = await prisma.business.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        city: true,
        description: true,
        targetAudience: true,
        toneOfVoice: true,
        brandAdvantages: true,
        preferredPhrases: true,
        forbiddenPhrases: true,
      },
    });
  } catch {
    return <p role="alert" className="text-sm text-error">We could not load your business profile. Please try again.</p>;
  }

  let services: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
  }> = [];

  if (business) {
    try {
      const rows = await prisma.service.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          currency: true,
        },
      });
      services = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price !== null ? Number(row.price) : null,
        currency: row.currency,
      }));
    } catch {
      return <p role="alert" className="text-sm text-error">We could not load your services. Please try again.</p>;
    }
  }

  const businessFormValues = business
    ? {
        name: business.name,
        city: business.city ?? "",
        description: business.description ?? "",
        target_audience: business.targetAudience ?? "",
        tone_of_voice: business.toneOfVoice ?? "",
        brand_advantages: business.brandAdvantages ?? "",
        preferred_phrases: business.preferredPhrases ?? "",
        forbidden_phrases: business.forbiddenPhrases ?? "",
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Business profile</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Your business</h1>
        <p className="mt-2 max-w-2xl text-muted">Keep your business details and services in one place.</p>
      </div>
      <BusinessForm business={businessFormValues} />
      {business ? (
        <ServicesSection businessId={business.id} services={services} />
      ) : (
        <p className="rounded-card border border-dashed border-border p-5 text-sm text-muted">
          Save your business profile to start adding services.
        </p>
      )}
    </div>
  );
}
