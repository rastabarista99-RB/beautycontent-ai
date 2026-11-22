import {
  GeneratedContentValidationError,
  validateGeneratedContent,
  type GeneratedContent,
} from "@/lib/validation/generated-content";

export type GenerationRequestCallbacks = {
  onStart(): void;
  onSuccess(content: GeneratedContent, metadataWarning: boolean, revision: string): void;
  onError(message: string, code?: string): void;
  onFinish(): void;
  refresh(): void;
};

type RequestLock = { current: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getQuotaResetDate(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.resetAt !== "string") {
    return null;
  }

  const resetAt = payload.error.resetAt;
  if (!/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?(?:Z|\+00:00)$/.test(resetAt)) return null;

  const resetDate = new Date(resetAt);
  if (!Number.isFinite(resetDate.getTime()) || resetDate.toISOString().slice(0, 10) !== resetAt.slice(0, 10)) {
    return null;
  }

  return resetDate.toISOString().slice(0, 10);
}

function getSafeApiError(payload: unknown): { message: string; code?: string } {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const code = error && typeof error.code === "string" ? error.code : "";

  switch (code) {
    case "unauthenticated":
      return { message: "Your session has expired. Sign in and try again." };
    case "project_not_found":
      return { message: "This project could not be found. Refresh the page and try again." };
    case "project_context_invalid":
    case "business_context_invalid":
      return { message: "Add the required project and business details before generating content." };
    case "generation_quota_exceeded": {
      const resetDate = getQuotaResetDate(payload);
      return {
        code,
        message: resetDate
          ? `You've reached the daily limit of 5 AI generation attempts. Your limit resets at 00:00 UTC on ${resetDate}.`
          : "You've reached the daily limit of 5 AI generation attempts. The limit resets at 00:00 UTC.",
      };
    }
    case "provider_rate_limited":
      return { message: "Generation is temporarily rate limited. Please try again shortly." };
    case "provider_timeout":
      return { message: "Generation took too long. Please try again." };
    case "provider_not_configured":
      return { message: "Content generation is not configured. Please contact support." };
    case "project_content_conflict":
      return { message: "This project changed while content was generating. Refresh and try again." };
    default:
      return { message: "We could not generate content. Please try again." };
  }
}

export async function submitProjectGeneration(
  projectId: string,
  lock: RequestLock,
  callbacks: GenerationRequestCallbacks,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (lock.current) return;
  lock.current = true;

  try {
    callbacks.onStart();
    const response = await fetcher("/api/generate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      callbacks.onError("The generation service returned an invalid response. Please try again.");
      return;
    }

    if (!response.ok) {
      const error = getSafeApiError(payload);
      callbacks.onError(error.message, error.code);
      return;
    }

    if (
      !isRecord(payload)
      || !isRecord(payload.generation)
      || typeof payload.generation.metadataRecorded !== "boolean"
      || typeof payload.revision !== "string"
      || !Number.isFinite(Date.parse(payload.revision))
    ) {
      callbacks.onError("The generation service returned an invalid response. Please try again.");
      return;
    }

    let content: GeneratedContent;
    try {
      content = validateGeneratedContent(payload.result);
    } catch (error) {
      if (!(error instanceof GeneratedContentValidationError)) throw error;
      callbacks.onError("The generated content could not be displayed. Please try again.");
      return;
    }

    callbacks.onSuccess(content, !payload.generation.metadataRecorded, payload.revision);
    callbacks.refresh();
  } catch {
    callbacks.onError("We could not connect to the generation service. Please try again.");
  } finally {
    lock.current = false;
    callbacks.onFinish();
  }
}
