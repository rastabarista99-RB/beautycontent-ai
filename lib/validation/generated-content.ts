export const generatedContentLimits = {
  title: 160,
  content: 8000,
  cta: 400,
  hashtags: 12,
  hashtag: 48,
  notes: 1000,
  serializedResponse: 64_000,
} as const;

export type GeneratedContent = {
  title: string;
  content: string;
  cta: string | null;
  hashtags: string[];
  notes: string | null;
};

export class GeneratedContentValidationError extends Error {
  constructor() {
    super("The generated response did not match the expected content format.");
    this.name = "GeneratedContentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new GeneratedContentValidationError();
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new GeneratedContentValidationError();
  }

  return normalized;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new GeneratedContentValidationError();
  }

  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new GeneratedContentValidationError();
  }

  return normalized || null;
}

export function validateGeneratedContent(value: unknown): GeneratedContent {
  if (!isRecord(value)) {
    throw new GeneratedContentValidationError();
  }

  const expectedKeys = ["title", "content", "cta", "hashtags", "notes"];
  if (
    Object.keys(value).length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new GeneratedContentValidationError();
  }

  if (
    !Array.isArray(value.hashtags) ||
    value.hashtags.length > generatedContentLimits.hashtags
  ) {
    throw new GeneratedContentValidationError();
  }

  const hashtags = value.hashtags.map((hashtag) => {
    if (typeof hashtag !== "string") {
      throw new GeneratedContentValidationError();
    }

    const normalized = hashtag.trim();
    if (!normalized || normalized.length > generatedContentLimits.hashtag) {
      throw new GeneratedContentValidationError();
    }

    return normalized;
  });

  return {
    title: requiredText(value.title, generatedContentLimits.title),
    content: requiredText(value.content, generatedContentLimits.content),
    cta: optionalText(value.cta, generatedContentLimits.cta),
    hashtags,
    notes: optionalText(value.notes, generatedContentLimits.notes),
  };
}

export function parseGeneratedContent(text: string): GeneratedContent {
  if (text.length > generatedContentLimits.serializedResponse) {
    throw new GeneratedContentValidationError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeneratedContentValidationError();
  }

  return validateGeneratedContent(parsed);
}

export function parseSavedGeneratedContent(value: unknown): GeneratedContent | null {
  if (typeof value !== "string") return null;

  try {
    return parseGeneratedContent(value);
  } catch (error) {
    if (error instanceof GeneratedContentValidationError) return null;
    throw error;
  }
}
