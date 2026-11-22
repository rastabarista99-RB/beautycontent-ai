import "server-only";

import { GoogleGenAI } from "@google/genai";

import {
  ContentProviderError,
  maxOutputTokens,
  providerTimeoutMs,
  type ProviderGeneration,
} from "@/lib/ai/provider";

export const geminiModel = "gemini-3.5-flash-lite";

const allowedGoogleStatuses = new Set([
  "INVALID_ARGUMENT",
  "NOT_FOUND",
  "RESOURCE_EXHAUSTED",
  "PERMISSION_DENIED",
  "UNAUTHENTICATED",
  "FAILED_PRECONDITION",
  "INTERNAL",
  "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
]);

const allowedGoogleReasons = new Set([
  "API_KEY_INVALID",
  "BILLING_DISABLED",
  "CONSUMER_INVALID",
  "GENERATIVE_LANGUAGE_API_DISABLED",
  "LOCATION_POLICY_VIOLATED",
  "MODEL_NOT_FOUND",
  "RATE_LIMIT_EXCEEDED",
  "SERVICE_DISABLED",
  "USER_PROJECT_DENIED",
]);

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "content", "cta", "hashtags", "notes"],
  properties: {
    title: { type: "string" },
    content: { type: "string" },
    cta: {
      anyOf: [
        { type: "string" },
        { type: "null" },
      ],
    },
    hashtags: {
      type: "array",
      items: { type: "string" },
    },
    notes: {
      anyOf: [
        { type: "string" },
        { type: "null" },
      ],
    },
  },
};

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ContentProviderError("configuration");
  }

  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "v1beta",
        timeout: providerTimeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
  }

  return client;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getUpstreamStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;

  const candidates = [
    error.status,
    error.statusCode,
    isRecord(error.response) ? error.response.status : undefined,
  ];
  return candidates.find(
    (value): value is number =>
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 100 &&
      value <= 599,
  );
}

function sanitizedErrorCode(value: unknown): string | undefined {
  return typeof value === "string" && allowedGoogleStatuses.has(value) ? value : undefined;
}

function getGoogleErrorDetails(error: unknown): {
  status?: string;
  reason?: string;
} {
  if (!isRecord(error) || typeof error.message !== "string" || error.message.length > 16_384) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(error.message);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || !isRecord(parsed.error)) return {};

  const googleError = parsed.error;
  if (
    typeof googleError.code !== "number" ||
    !Number.isInteger(googleError.code) ||
    googleError.code < 100 ||
    googleError.code > 599
  ) {
    return {};
  }

  const status = sanitizedErrorCode(googleError.status);
  if (!status) return {};

  let reason: string | undefined;
  if (Array.isArray(googleError.details)) {
    for (const detail of googleError.details) {
      if (
        isRecord(detail) &&
        detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
        typeof detail.reason === "string" &&
        allowedGoogleReasons.has(detail.reason)
      ) {
        reason = detail.reason;
        break;
      }
    }
  }

  return { status, reason };
}

function classifyProviderError(error: unknown): ContentProviderError {
  const errorName = error instanceof Error ? error.name : "";
  const status = getUpstreamStatus(error);

  if (
    errorName === "AbortError" ||
    errorName === "TimeoutError" ||
    status === 408 ||
    status === 504
  ) {
    return new ContentProviderError("timeout");
  }
  if (status === 429) {
    return new ContentProviderError("rate_limit");
  }
  if (status === 401 || status === 403) {
    return new ContentProviderError("configuration");
  }
  if (status === 400 || status === 404 || status === 405 || status === 422) {
    return new ContentProviderError("request_rejected");
  }
  return new ContentProviderError("unavailable");
}

function logProviderFailure(error: unknown): void {
  const diagnostic: {
    provider: "gemini";
    operation: "generateContent";
    model: string;
    upstreamStatus?: number;
    errorCode?: string;
    errorReason?: string;
  } = {
    provider: "gemini",
    operation: "generateContent",
    model: geminiModel,
  };
  const status = getUpstreamStatus(error);
  const googleError = getGoogleErrorDetails(error);
  if (status !== undefined) diagnostic.upstreamStatus = status;
  if (googleError.status !== undefined) diagnostic.errorCode = googleError.status;
  if (googleError.reason !== undefined) diagnostic.errorReason = googleError.reason;

  console.error("[ai-provider]", JSON.stringify(diagnostic));
}

export async function generateProjectContent(
  instructions: string,
  input: string,
): Promise<ProviderGeneration> {
  let response;
  try {
    response = await getClient().models.generateContent({
      model: geminiModel,
      contents: input,
      config: {
        systemInstruction: instructions,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
        maxOutputTokens,
        httpOptions: {
          timeout: providerTimeoutMs,
          retryOptions: { attempts: 1 },
        },
      },
    });
  } catch (error) {
    if (error instanceof ContentProviderError) throw error;
    logProviderFailure(error);
    throw classifyProviderError(error);
  }

  if (!response.text) {
    throw new ContentProviderError("invalid_response");
  }

  const candidateTokens = response.usageMetadata?.candidatesTokenCount;
  const thoughtTokens = response.usageMetadata?.thoughtsTokenCount;

  return {
    outputText: response.text,
    model: response.modelVersion || geminiModel,
    inputTokens: response.usageMetadata?.promptTokenCount ?? null,
    outputTokens: candidateTokens === undefined && thoughtTokens === undefined
      ? null
      : (candidateTokens ?? 0) + (thoughtTokens ?? 0),
  };
}
