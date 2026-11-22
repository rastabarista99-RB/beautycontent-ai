import "server-only";

export type ProviderErrorCategory =
  | "configuration"
  | "timeout"
  | "rate_limit"
  | "request_rejected"
  | "unavailable"
  | "invalid_response";

export class ContentProviderError extends Error {
  constructor(readonly category: ProviderErrorCategory) {
    super("The content provider could not complete the request.");
    this.name = "ContentProviderError";
  }
}

export type ProviderGeneration = {
  outputText: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export const maxOutputTokens = 1000;
export const providerTimeoutMs = 30_000;
