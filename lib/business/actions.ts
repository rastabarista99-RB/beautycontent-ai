"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type BusinessActionState = {
  error?: string;
  success?: boolean;
};

const genericBusinessError = "We could not save that change. Please try again.";

function getText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function getOptionalText(formData: FormData, name: string): string | null {
  const value = getText(formData, name);
  return value || null;
}

async function getAuthenticatedUserId(): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  if (error || !userId) {
    return { error: "Your session has expired. Please sign in again." };
  }

  return { id: userId };
}

export async function saveBusiness(
  _previousState: BusinessActionState,
  formData: FormData,
): Promise<BusinessActionState> {
  const user = await getAuthenticatedUserId();
  if ("error" in user) return user;

  const name = getText(formData, "name");
  if (!name) {
    return { error: "Enter your business name." };
  }

  const supabase = await createClient();
  const values = {
    user_id: user.id,
    name,
    city: getOptionalText(formData, "city"),
    description: getOptionalText(formData, "description"),
    target_audience: getOptionalText(formData, "targetAudience"),
    tone_of_voice: getOptionalText(formData, "toneOfVoice"),
    brand_advantages: getOptionalText(formData, "brandAdvantages"),
    preferred_phrases: getOptionalText(formData, "preferredPhrases"),
    forbidden_phrases: getOptionalText(formData, "forbiddenPhrases"),
  };

  const { error } = await supabase
    .from("businesses")
    .upsert(values, { onConflict: "user_id" });

  if (error) {
    return { error: genericBusinessError };
  }

  revalidatePath("/business");
  return { success: true };
}

export async function saveService(
  _previousState: BusinessActionState,
  formData: FormData,
): Promise<BusinessActionState> {
  const user = await getAuthenticatedUserId();
  if ("error" in user) return user;

  const businessId = getText(formData, "businessId");
  const serviceId = getOptionalText(formData, "serviceId");
  const name = getText(formData, "name");
  const priceText = getText(formData, "price");
  const currency = getText(formData, "currency") || "MDL";

  if (!businessId || !name) {
    return { error: "Enter a service name." };
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(priceText)) {
    return { error: "Enter a valid non-negative price with up to two decimal places." };
  }

  if (currency !== "MDL") {
    return { error: "Choose a supported currency." };
  }

  const supabase = await createClient();
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (businessError || !business) {
    return { error: "We could not verify this business." };
  }

  const values = {
    business_id: business.id,
    name,
    description: getOptionalText(formData, "description"),
    price: priceText,
    currency,
  };

  const query = serviceId
    ? supabase.from("services").update(values).eq("id", serviceId).eq("business_id", business.id)
    : supabase.from("services").insert(values);
  const { error } = await query;

  if (error) {
    return { error: genericBusinessError };
  }

  revalidatePath("/business");
  return { success: true };
}

export async function deleteService(formData: FormData): Promise<BusinessActionState> {
  const user = await getAuthenticatedUserId();
  if ("error" in user) return user;

  const businessId = getText(formData, "businessId");
  const serviceId = getText(formData, "serviceId");
  if (!businessId || !serviceId) {
    return { error: "We could not identify that service." };
  }

  const supabase = await createClient();
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (businessError || !business) {
    return { error: "We could not verify this business." };
  }

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("business_id", business.id);

  if (error) {
    return { error: genericBusinessError };
  }

  revalidatePath("/business");
  return { success: true };
}
