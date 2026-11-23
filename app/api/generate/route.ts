import { NextResponse } from "next/server";

import { ContentProviderError } from "@/lib/ai/provider";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { generateProjectContent as generateGeminiContent } from "@/lib/gemini/client";
import { generateProjectContent as generateOpenAiContent } from "@/lib/openai/client";
import { reserveDailyGenerationAttempt } from "@/lib/projects/quota";
import { buildProjectContentPrompt, ProjectContentPromptError } from "@/lib/prompts/project-content";
import { GeneratedContentValidationError, parseGeneratedContent } from "@/lib/validation/generated-content";

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxRequestBytes = 1024;
const maxDatabaseInteger = 2_147_483_647;
const dailyGenerationLimit = 5;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQuotaReservation(value: unknown): {
  allowed: boolean;
  remainingAttempts: number;
  resetAt: string;
} | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;

  const reservation = value[0];
  const remainingAttempts = reservation.remaining_attempts;
  if (
    typeof reservation.allowed !== "boolean"
    || typeof remainingAttempts !== "number"
    || !Number.isInteger(remainingAttempts)
    || remainingAttempts < 0
    || remainingAttempts > dailyGenerationLimit
    || typeof reservation.reset_at !== "string"
    || !/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.\d+)?(?:Z|\+00:00)$/.test(reservation.reset_at)
  ) {
    return null;
  }

  const resetDate = new Date(reservation.reset_at);
  if (
    !Number.isFinite(resetDate.getTime())
    || resetDate.toISOString().slice(0, 10) !== reservation.reset_at.slice(0, 10)
    || resetDate.getUTCHours() !== 0
    || resetDate.getUTCMinutes() !== 0
    || resetDate.getUTCSeconds() !== 0
    || resetDate.getUTCMilliseconds() !== 0
  ) {
    return null;
  }

  if (
    (reservation.allowed && remainingAttempts >= dailyGenerationLimit)
    || (!reservation.allowed && remainingAttempts !== 0)
  ) {
    return null;
  }

  return {
    allowed: reservation.allowed,
    remainingAttempts,
    resetAt: resetDate.toISOString(),
  };
}

function safeTokenCount(value: number | null): number | null {
  return (
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= maxDatabaseInteger
  ) ? value : null;
}

function toRevisionIso(value: Date | string): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function getNextRevision(currentRevision: string): string | null {
  const currentMilliseconds = Date.parse(currentRevision);
  if (!Number.isFinite(currentMilliseconds)) return null;

  return new Date(Math.max(Date.now(), currentMilliseconds + 1)).toISOString();
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return errorResponse("invalid_request", "Send a JSON request.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxRequestBytes) {
    return errorResponse("invalid_request", "The request is too large.", 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxRequestBytes) {
      return errorResponse("invalid_request", "The request is too large.", 413);
    }
    body = JSON.parse(text);
  } catch {
    return errorResponse("invalid_request", "The request body must be valid JSON.", 400);
  }

  if (
    !isRecord(body)
    || Object.keys(body).length !== 1
    || typeof body.projectId !== "string"
    || !projectIdPattern.test(body.projectId)
  ) {
    return errorResponse("invalid_request", "Provide a valid project ID.", 400);
  }

  let session;
  try {
    session = await getSession();
  } catch {
    return errorResponse("authentication_unavailable", "Authentication is temporarily unavailable.", 503);
  }

  const userId = session?.userId ?? null;
  if (!userId) {
    return errorResponse("unauthenticated", "Sign in to generate project content.", 401);
  }

  let project;
  try {
    project = await prisma.project.findFirst({
      where: { id: body.projectId, userId },
      select: {
        id: true,
        userId: true,
        businessId: true,
        type: true,
        goal: true,
        title: true,
        updatedAt: true,
      },
    });
  } catch {
    return errorResponse("project_unavailable", "The project could not be loaded.", 500);
  }

  if (!project) {
    return errorResponse("project_not_found", "Project not found.", 404);
  }

  const currentRevision = toRevisionIso(project.updatedAt);
  if (!currentRevision) {
    return errorResponse("project_unavailable", "The project revision could not be verified.", 500);
  }

  let business;
  try {
    business = await prisma.business.findFirst({
      where: { id: project.businessId, userId },
      select: {
        id: true,
        userId: true,
        name: true,
        industry: true,
        city: true,
        description: true,
        targetAudience: true,
        toneOfVoice: true,
        brandDescription: true,
        brandAdvantages: true,
        preferredPhrases: true,
        forbiddenPhrases: true,
      },
    });
  } catch {
    return errorResponse("business_unavailable", "Business context could not be loaded.", 500);
  }

  if (!business) {
    return errorResponse("business_context_invalid", "The project has no available Business Profile.", 422);
  }

  let services;
  try {
    const rows = await prisma.service.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
      take: 8,
      select: {
        name: true,
        description: true,
        price: true,
        currency: true,
      },
    });
    services = rows.map((row) => ({
      name: row.name,
      description: row.description,
      price: row.price !== null ? Number(row.price) : null,
      currency: row.currency,
    }));
  } catch {
    return errorResponse("business_context_unavailable", "Business services could not be loaded.", 500);
  }

  let prompt;
  try {
    prompt = buildProjectContentPrompt({
      project: {
        type: project.type,
        goal: project.goal,
        title: project.title,
      },
      business: {
        name: business.name,
        industry: business.industry,
        city: business.city,
        description: business.description,
        target_audience: business.targetAudience,
        tone_of_voice: business.toneOfVoice,
        brand_description: business.brandDescription,
        brand_advantages: business.brandAdvantages,
        preferred_phrases: business.preferredPhrases,
        forbidden_phrases: business.forbiddenPhrases,
      },
      services,
    });
  } catch (error) {
    if (error instanceof ProjectContentPromptError) {
      return errorResponse("project_context_invalid", "The project does not contain valid generation details.", 422);
    }
    throw error;
  }

  const provider = process.env.AI_PROVIDER;
  if (provider !== undefined && provider !== "openai" && provider !== "gemini") {
    return errorResponse("provider_not_configured", "Content generation is not configured.", 503);
  }

  let reservationResult;
  try {
    reservationResult = await reserveDailyGenerationAttempt(userId);
  } catch {
    return errorResponse("generation_quota_unavailable", "Generation is temporarily unavailable. Please try again.", 503);
  }

  const reservation = parseQuotaReservation(reservationResult);
  if (!reservation) {
    return errorResponse("generation_quota_unavailable", "Generation is temporarily unavailable. Please try again.", 503);
  }

  if (!reservation.allowed) {
    return NextResponse.json({
      error: {
        code: "generation_quota_exceeded",
        message: "The daily generation attempt limit has been reached.",
        resetAt: reservation.resetAt,
      },
    }, { status: 429 });
  }

  // Reservations are charges: failures from this point onward are not refunded.
  let providerResult;
  try {
    if (provider === "gemini") {
      providerResult = await generateGeminiContent(prompt.instructions, prompt.input);
    } else {
      providerResult = await generateOpenAiContent(prompt.instructions, prompt.input);
    }
  } catch (error) {
    if (error instanceof ContentProviderError) {
      switch (error.category) {
        case "configuration":
          return errorResponse("provider_not_configured", "Content generation is not configured.", 503);
        case "timeout":
          return errorResponse("provider_timeout", "Content generation timed out. Please try again.", 504);
        case "rate_limit":
          return errorResponse("provider_rate_limited", "Content generation is temporarily rate limited.", 429);
        case "request_rejected":
          return errorResponse("provider_request_rejected", "The content provider rejected the generation request.", 502);
        case "invalid_response":
          return errorResponse("invalid_generated_content", "The generated result was not usable. Please try again.", 502);
        case "unavailable":
          return errorResponse("provider_unavailable", "Content generation is temporarily unavailable.", 502);
      }
    }
    return errorResponse("provider_unavailable", "Content generation is temporarily unavailable.", 502);
  }

  let generatedContent;
  try {
    generatedContent = parseGeneratedContent(providerResult.outputText);
  } catch (error) {
    if (error instanceof GeneratedContentValidationError) {
      return errorResponse("invalid_generated_content", "The generated result was not usable. Please try again.", 502);
    }
    throw error;
  }

  const serializedContent = JSON.stringify(generatedContent);
  const nextRevision = getNextRevision(currentRevision);
  if (!nextRevision) {
    return errorResponse("project_unavailable", "The project revision could not be verified.", 500);
  }

  let updatedCount: number;
  try {
    const updated = await prisma.project.updateMany({
      where: {
        id: project.id,
        userId,
        updatedAt: project.updatedAt instanceof Date ? project.updatedAt : new Date(currentRevision),
      },
      data: {
        prompt: prompt.prompt,
        content: serializedContent,
        updatedAt: new Date(nextRevision),
      },
    });
    updatedCount = updated.count;
  } catch {
    return errorResponse("project_persistence_failed", "Generated content could not be saved to the project.", 500);
  }

  if (updatedCount === 0) {
    return errorResponse(
      "project_content_conflict",
      "This project changed while content was generating. Refresh and try again.",
      409,
    );
  }

  const model = providerResult.model;
  const inputTokens = safeTokenCount(providerResult.inputTokens);
  const outputTokens = safeTokenCount(providerResult.outputTokens);

  try {
    await prisma.generation.create({
      data: {
        projectId: project.id,
        model,
        inputTokens,
        outputTokens,
      },
    });
  } catch {
    return NextResponse.json({
      result: generatedContent,
      revision: nextRevision,
      generation: {
        model,
        inputTokens,
        outputTokens,
        metadataRecorded: false,
      },
      warning: {
        code: "generation_metadata_not_recorded",
        message: "Generated content was saved, but generation details could not be recorded.",
      },
    });
  }

  return NextResponse.json({
    result: generatedContent,
    revision: nextRevision,
    generation: {
      model,
      inputTokens,
      outputTokens,
      metadataRecorded: true,
    },
  });
}
