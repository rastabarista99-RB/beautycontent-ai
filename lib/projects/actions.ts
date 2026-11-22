"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type ProjectActionState = {
  error?: string;
  success?: boolean;
};

const projectTypes = ["post", "story", "reels", "ad"] as const;
const maxGoalLength = 500;
const maxTitleLength = 120;
type ProjectType = (typeof projectTypes)[number];

function getText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProjectInput = {
  type: ProjectType;
  goal: string;
  title: string | null;
};

function isProjectType(value: string): value is ProjectType {
  return projectTypes.some((allowedType) => allowedType === value);
}

function validateProjectInput(formData: FormData): ProjectInput | { error: string } {
  const type = getText(formData, "type");
  const goal = getText(formData, "goal");
  const title = getText(formData, "title");

  if (!isProjectType(type)) {
    return { error: "Choose a valid project type." };
  }

  if (!goal) {
    return { error: "Enter a project goal." };
  }

  if (goal.length > maxGoalLength) {
    return { error: `Project goal must be ${maxGoalLength} characters or fewer.` };
  }

  if (title.length > maxTitleLength) {
    return { error: `Project title must be ${maxTitleLength} characters or fewer.` };
  }

  return { type, goal, title: title || null };
}

async function getAuthenticatedUserId(): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  if (claimsError || !userId) {
    return { error: "Your session has expired. Please sign in again." };
  }

  return { id: userId };
}

export async function createProject(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const user = await getAuthenticatedUserId();
  if ("error" in user) return user;

  const input = validateProjectInput(formData);
  if ("error" in input) return input;

  const supabase = await createClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (businessError) {
    return { error: "We could not verify your Business Profile. Please try again." };
  }

  if (!business) {
    return { error: "Create a Business Profile before creating a project." };
  }

  const { error: insertError } = await supabase.from("projects").insert({
    user_id: user.id,
    business_id: business.id,
    ...input,
  });

  if (insertError) {
    return { error: "We could not create your project. Please try again." };
  }

  revalidatePath("/projects");
  return { success: true };
}

export async function updateProject(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const user = await getAuthenticatedUserId();
  if ("error" in user) return user;

  const projectId = getText(formData, "projectId");
  if (!projectIdPattern.test(projectId)) {
    return { error: "This project is no longer available." };
  }

  const input = validateProjectInput(formData);
  if ("error" in input) return input;

  const supabase = await createClient();
  const { data: updatedProject, error } = await supabase
    .from("projects")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "We could not update your project. Please try again." };
  }

  if (!updatedProject) {
    return { error: "This project is no longer available." };
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function deleteProject(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const user = await getAuthenticatedUserId();
  if ("error" in user) return user;

  const projectId = getText(formData, "projectId");
  if (!projectIdPattern.test(projectId)) {
    return { error: "This project is no longer available." };
  }

  const supabase = await createClient();
  const { data: deletedProject, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "We could not delete your project. Please try again." };
  }

  if (!deletedProject) {
    return { error: "This project is no longer available." };
  }

  revalidatePath("/projects");
  redirect("/projects");
}
