"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

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
  const session = await getSession();
  if (!session?.userId) {
    return { error: "Your session has expired. Please sign in again." };
  }

  return { id: session.userId };
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

  const values = {
    name,
    city: getOptionalText(formData, "city"),
    description: getOptionalText(formData, "description"),
    targetAudience: getOptionalText(formData, "targetAudience"),
    toneOfVoice: getOptionalText(formData, "toneOfVoice"),
    brandAdvantages: getOptionalText(formData, "brandAdvantages"),
    preferredPhrases: getOptionalText(formData, "preferredPhrases"),
    forbiddenPhrases: getOptionalText(formData, "forbiddenPhrases"),
  };

  try {
    await prisma.business.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...values,
      },
      update: values,
    });
  } catch {
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

  let business: { id: string } | null;
  try {
    business = await prisma.business.findFirst({
      where: { id: businessId, userId: user.id },
      select: { id: true },
    });
  } catch {
    return { error: "We could not verify this business." };
  }

  if (!business) {
    return { error: "We could not verify this business." };
  }

  const values = {
    name,
    description: getOptionalText(formData, "description"),
    price: priceText,
    currency,
  };

  try {
    if (serviceId) {
      const updated = await prisma.service.updateMany({
        where: { id: serviceId, businessId: business.id },
        data: values,
      });
      if (updated.count === 0) {
        return { error: genericBusinessError };
      }
    } else {
      await prisma.service.create({
        data: {
          businessId: business.id,
          ...values,
        },
      });
    }
  } catch {
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

  let business: { id: string } | null;
  try {
    business = await prisma.business.findFirst({
      where: { id: businessId, userId: user.id },
      select: { id: true },
    });
  } catch {
    return { error: "We could not verify this business." };
  }

  if (!business) {
    return { error: "We could not verify this business." };
  }

  try {
    const deleted = await prisma.service.deleteMany({
      where: { id: serviceId, businessId: business.id },
    });
    if (deleted.count === 0) {
      return { error: genericBusinessError };
    }
  } catch {
    return { error: genericBusinessError };
  }

  revalidatePath("/business");
  return { success: true };
}
