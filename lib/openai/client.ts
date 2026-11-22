import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai";

import {
  ContentProviderError,
  maxOutputTokens,
  providerTimeoutMs,
  type ProviderGeneration,
} from "@/lib/ai/provider";

export { ContentProviderError, maxOutputTokens };
export type { ProviderGeneration };

export const openAiModel = "gpt-4.1-mini";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ContentProviderError("configuration");
  }

  if (!client) {
    client = new OpenAI({
      apiKey,
      maxRetries: 0,
      timeout: providerTimeoutMs,
    });
  }

  return client;
}

function classifyProviderError(error: unknown): ContentProviderError {
  if (error instanceof APIConnectionTimeoutError) {
    return new ContentProviderError("timeout");
  }
  if (error instanceof RateLimitError) {
    return new ContentProviderError("rate_limit");
  }
  if (error instanceof APIConnectionError) {
    return new ContentProviderError("unavailable");
  }
  if (error instanceof APIError && error.status && error.status >= 500) {
    return new ContentProviderError("unavailable");
  }
  return new ContentProviderError("unavailable");
}

export async function generateProjectContent(
  instructions: string,
  input: string,
): Promise<ProviderGeneration> {
  let response;
  try {
    response = await getClient().responses.create({
      model: openAiModel,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: "beauty_content",
          strict: true,
          schema: {
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
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof ContentProviderError) throw error;
    throw classifyProviderError(error);
  }

  if (!response.output_text) {
    throw new ContentProviderError("invalid_response");
  }

  return {
    outputText: response.output_text,
    model: response.model || openAiModel,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}
