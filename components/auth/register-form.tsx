"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthActionState } from "@/lib/auth/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "./submit-button";

const initialState: AuthActionState = {};

export function RegisterForm() {
  const [state, formAction] = useActionState(signUp, initialState);

  if (state.success) {
    return (
      <Card className="w-full max-w-md">
        <p className="text-sm font-medium text-primary">Almost there</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Check your email</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          We sent you a confirmation link. Confirm your email before signing in to BeautyContent AI.
        </p>
        <Link href="/login" className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark">
          Go to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <div className="mb-6">
        <p className="text-sm font-medium text-primary">Get started</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Create your account</h1>
        <p className="mt-2 text-sm text-muted">Start building better content for your beauty business.</p>
      </div>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-ink">Email</label>
          <Input id="register-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-ink">Password</label>
          <Input id="register-password" name="password" type="password" autoComplete="new-password" minLength={6} required />
        </div>
        <div>
          <label htmlFor="register-confirm-password" className="mb-1.5 block text-sm font-medium text-ink">Confirm password</label>
          <Input id="register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={6} required />
        </div>
        {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
        <SubmitButton label="Create account" />
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:text-primary-dark">Sign in</Link>
      </p>
    </Card>
  );
}
