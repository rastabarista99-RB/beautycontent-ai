import "server-only";

import { cookies, headers } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./session-token";

export type AuthSession = {
  userId: string;
  email: string;
};

async function shouldUseSecureCookie(): Promise<boolean> {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const origin = headerStore.get("origin");
  return forwardedProto === "https" || (origin?.startsWith("https://") ?? false);
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  return {
    userId: payload.sub,
    email: payload.email,
  };
}

export async function setSessionCookie(user: { id: string; email: string }): Promise<void> {
  const token = await signSessionToken({ userId: user.id, email: user.email });
  const cookieStore = await cookies();
  const secure = await shouldUseSecureCookie();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
