"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  GeneratedContentValidationError,
  parseSavedGeneratedContent,
  validateGeneratedContent,
  type GeneratedContent,
} from "@/lib/validation/generated-content";

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const revisionPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

type SaveEditedContentResult =
  | { ok: true; content: GeneratedContent; revision: string }
  | { ok: false; code: "invalid" | "unauthenticated" | "unavailable" | "conflict"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
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

export async function saveEditedGeneratedContent(
  input: unknown,
): Promise<SaveEditedContentResult> {
  if (
    !isRecord(input)
    || !hasExactKeys(input, ["projectId", "expectedUpdatedAt", "editedContent"])
    || typeof input.projectId !== "string"
    || !projectIdPattern.test(input.projectId)
    || typeof input.expectedUpdatedAt !== "string"
    || !revisionPattern.test(input.expectedUpdatedAt)
    || !Number.isFinite(Date.parse(input.expectedUpdatedAt))
    || !isRecord(input.editedContent)
    || !hasExactKeys(input.editedContent, ["content", "cta", "hashtags"])
    || typeof input.editedContent.content !== "string"
    || (input.editedContent.cta !== null && typeof input.editedContent.cta !== "string")
    || !Array.isArray(input.editedContent.hashtags)
  ) {
    return { ok: false, code: "invalid", message: "The edited content could not be saved. Check your changes and try again." };
  }

  let session;
  try {
    session = await getSession();
  } catch {
    return { ok: false, code: "unauthenticated", message: "Your session has expired. Sign in and try again." };
  }

  const userId = session?.userId ?? null;
  if (!userId) {
    return { ok: false, code: "unauthenticated", message: "Your session has expired. Sign in and try again." };
  }

  let project;
  try {
    project = await prisma.project.findFirst({
      where: { id: input.projectId, userId },
      select: { id: true, content: true, updatedAt: true },
    });
  } catch {
    return { ok: false, code: "unavailable", message: "We could not load this project. Please try again." };
  }

  if (!project) {
    return { ok: false, code: "unavailable", message: "This project is no longer available." };
  }

  const currentRevision = toRevisionIso(project.updatedAt);
  const expectedRevision = toRevisionIso(input.expectedUpdatedAt);
  if (!currentRevision || !expectedRevision || currentRevision !== expectedRevision) {
    return { ok: false, code: "conflict", message: "This project changed elsewhere. Refresh the page before saving again." };
  }

  const storedContent = parseSavedGeneratedContent(project.content);
  if (!storedContent) {
    return { ok: false, code: "unavailable", message: "The saved content is unavailable or invalid. Regenerate content before saving edits." };
  }

  try {
    const candidate = validateGeneratedContent({
      ...storedContent,
      content: input.editedContent.content,
      cta: input.editedContent.cta,
      hashtags: input.editedContent.hashtags,
    });
    const nextRevision = getNextRevision(currentRevision);
    if (!nextRevision) {
      return { ok: false, code: "unavailable", message: "We could not verify this project's revision. Refresh and try again." };
    }

    const updated = await prisma.project.updateMany({
      where: {
        id: input.projectId,
        userId,
        updatedAt: project.updatedAt instanceof Date ? project.updatedAt : new Date(currentRevision),
      },
      data: {
        content: JSON.stringify(candidate),
        updatedAt: new Date(nextRevision),
      },
    });

    if (updated.count === 0) {
      return { ok: false, code: "conflict", message: "This project changed elsewhere. Refresh the page before saving again." };
    }

    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true, content: candidate, revision: nextRevision };
  } catch (error) {
    if (error instanceof GeneratedContentValidationError) {
      return { ok: false, code: "invalid", message: "The edited content exceeds an allowed limit or has invalid fields." };
    }
    return { ok: false, code: "unavailable", message: "We could not save your changes. Please try again." };
  }
}
