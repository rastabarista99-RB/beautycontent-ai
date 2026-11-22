"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  success?: boolean;
};

const invalidCredentialsMessage = "The email or password is incorrect.";
const genericAuthErrorMessage = "We could not complete that request. Please try again.";

function getEmail(formData: FormData): string {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = getEmail(formData);
  const password = String(formData.get("password") ?? "");

  if (!isValidEmail(email) || password.length === 0) {
    return { error: "Enter a valid email address and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: "Please confirm your email before signing in." };
    }

    if (error.status === 400 || error.message.toLowerCase().includes("invalid login")) {
      return { error: invalidCredentialsMessage };
    }

    return { error: genericAuthErrorMessage };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = getEmail(formData);
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }

  if (password.length < 6) {
    return { error: "Your password must be at least 6 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: origin ? { emailRedirectTo: `${origin}/auth/confirm` } : undefined,
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "An account with this email already exists. Try signing in." };
    }

    return { error: genericAuthErrorMessage };
  }

  return { success: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error("Unable to sign out.");
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
