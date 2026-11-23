"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

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

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "P2002"
  );
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

  let user: { id: string; email: string; passwordHash: string } | null;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  } catch {
    return { error: genericAuthErrorMessage };
  }

  if (!user) {
    return { error: invalidCredentialsMessage };
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    return { error: invalidCredentialsMessage };
  }

  try {
    await setSessionCookie({ id: user.id, email: user.email });
  } catch {
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

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    return { error: genericAuthErrorMessage };
  }

  let createdUser: { id: string; email: string };
  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return { error: "An account with this email already exists. Try signing in." };
    }

    createdUser = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return { error: "An account with this email already exists. Try signing in." };
    }
    return { error: genericAuthErrorMessage };
  }

  try {
    await setSessionCookie(createdUser);
  } catch {
    return { error: genericAuthErrorMessage };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  revalidatePath("/", "layout");
  redirect("/login");
}
