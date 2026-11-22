"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  if (claimsError || !userId) {
    return { ok: false, code: "unauthenticated", message: "Your session has expired. Sign in and try again." };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, content, updated_at")
    .eq("id", input.projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectError) {
    return { ok: false, code: "unavailable", message: "We could not load this project. Please try again." };
  }
  if (!project) {
    return { ok: false, code: "unavailable", message: "This project is no longer available." };
  }
  if (typeof project.updated_at !== "string" || project.updated_at !== input.expectedUpdatedAt) {
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
    const nextRevision = getNextRevision(project.updated_at);
    if (!nextRevision) {
      return { ok: false, code: "unavailable", message: "We could not verify this project's revision. Refresh and try again." };
    }

    const { data: updatedProject, error: updateError } = await supabase
      .from("projects")
      .update({
        content: JSON.stringify(candidate),
        updated_at: nextRevision,
      })
      .eq("id", input.projectId)
      .eq("user_id", userId)
      .eq("updated_at", project.updated_at)
      .select("id, updated_at")
      .maybeSingle();

    if (updateError) {
      return { ok: false, code: "unavailable", message: "We could not save your changes. Please try again." };
    }
    if (!updatedProject) {
      return { ok: false, code: "conflict", message: "This project changed elsewhere. Refresh the page before saving again." };
    }
    if (
      typeof updatedProject.updated_at !== "string"
      || !revisionPattern.test(updatedProject.updated_at)
      || !Number.isFinite(Date.parse(updatedProject.updated_at))
    ) {
      return { ok: false, code: "unavailable", message: "We could not verify the saved revision. Refresh the page and try again." };
    }

    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true, content: candidate, revision: updatedProject.updated_at };
  } catch (error) {
    if (error instanceof GeneratedContentValidationError) {
      return { ok: false, code: "invalid", message: "The edited content exceeds an allowed limit or has invalid fields." };
    }
    throw error;
  }
}
