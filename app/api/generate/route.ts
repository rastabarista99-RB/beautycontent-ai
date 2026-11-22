import { NextResponse } from "next/server";

import { buildProjectContentPrompt, ProjectContentPromptError } from "@/lib/prompts/project-content";
import { createClient } from "@/lib/supabase/server";
import { ContentProviderError } from "@/lib/ai/provider";
import { generateProjectContent as generateGeminiContent } from "@/lib/gemini/client";
import { generateProjectContent as generateOpenAiContent } from "@/lib/openai/client";
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
    || !/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?(?:Z|\+00:00)$/.test(reservation.reset_at)
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
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maxDatabaseInteger
  ) ? value : null;
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
    !isRecord(body) ||
    Object.keys(body).length !== 1 ||
    typeof body.projectId !== "string" ||
    !projectIdPattern.test(body.projectId)
  ) {
    return errorResponse("invalid_request", "Provide a valid project ID.", 400);
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return errorResponse("server_configuration", "The service is temporarily unavailable.", 503);
  }

  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) {
    return errorResponse("authentication_unavailable", "Authentication is temporarily unavailable.", 503);
  }

  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) {
    return errorResponse("unauthenticated", "Sign in to generate project content.", 401);
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, user_id, business_id, type, goal, title, updated_at")
    .eq("id", body.projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectError) {
    return errorResponse("project_unavailable", "The project could not be loaded.", 500);
  }
  if (!project) {
    return errorResponse("project_not_found", "Project not found.", 404);
  }
  if (typeof project.updated_at !== "string") {
    return errorResponse("project_unavailable", "The project revision could not be verified.", 500);
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, user_id, name, industry, city, description, target_audience, tone_of_voice, brand_description, brand_advantages, preferred_phrases, forbidden_phrases")
    .eq("id", project.business_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (businessError) {
    return errorResponse("business_unavailable", "Business context could not be loaded.", 500);
  }
  if (!business) {
    return errorResponse("business_context_invalid", "The project has no available Business Profile.", 422);
  }

  const { data: services, error: servicesError } = await supabase
    .from("services")
    .select("name, description, price, currency")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true })
    .limit(8);

  if (servicesError) {
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
        target_audience: business.target_audience,
        tone_of_voice: business.tone_of_voice,
        brand_description: business.brand_description,
        brand_advantages: business.brand_advantages,
        preferred_phrases: business.preferred_phrases,
        forbidden_phrases: business.forbidden_phrases,
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
    reservationResult = await supabase.rpc("reserve_daily_generation_attempt");
  } catch {
    return errorResponse("generation_quota_unavailable", "Generation is temporarily unavailable. Please try again.", 503);
  }

  if (!isRecord(reservationResult) || reservationResult.error) {
    return errorResponse("generation_quota_unavailable", "Generation is temporarily unavailable. Please try again.", 503);
  }

  const reservation = parseQuotaReservation(reservationResult.data);
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
  const nextRevision = getNextRevision(project.updated_at);
  if (!nextRevision) {
    return errorResponse("project_unavailable", "The project revision could not be verified.", 500);
  }

  const { data: updatedProject, error: updateError } = await supabase
    .from("projects")
    .update({
      prompt: prompt.prompt,
      content: serializedContent,
      updated_at: nextRevision,
    })
    .eq("id", project.id)
    .eq("user_id", userId)
    .eq("updated_at", project.updated_at)
    .select("id, updated_at")
    .maybeSingle();

  if (updateError) {
    return errorResponse("project_persistence_failed", "Generated content could not be saved to the project.", 500);
  }
  if (!updatedProject) {
    return errorResponse(
      "project_content_conflict",
      "This project changed while content was generating. Refresh and try again.",
      409,
    );
  }
  if (typeof updatedProject.updated_at !== "string") {
    return errorResponse("project_unavailable", "The saved project revision could not be verified.", 500);
  }

  const model = providerResult.model;
  const { error: generationError } = await supabase.from("generations").insert({
    project_id: project.id,
    model,
    input_tokens: safeTokenCount(providerResult.inputTokens),
    output_tokens: safeTokenCount(providerResult.outputTokens),
  });

  if (generationError) {
    return NextResponse.json({
      result: generatedContent,
      revision: updatedProject.updated_at,
      generation: {
        model,
        inputTokens: safeTokenCount(providerResult.inputTokens),
        outputTokens: safeTokenCount(providerResult.outputTokens),
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
    revision: updatedProject.updated_at,
    generation: {
      model,
      inputTokens: safeTokenCount(providerResult.inputTokens),
      outputTokens: safeTokenCount(providerResult.outputTokens),
      metadataRecorded: true,
    },
  });
}
