"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type AuthActionState } from "@/lib/auth/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "./submit-button";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <Card className="w-full max-w-md">
      <div className="mb-6">
        <p className="text-sm font-medium text-primary">Welcome back</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-muted">Access your BeautyContent AI workspace.</p>
      </div>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-ink">Email</label>
          <Input id="login-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-ink">Password</label>
          <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
        <SubmitButton label="Sign in" />
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-primary hover:text-primary-dark">Create one</Link>
      </p>
    </Card>
  );
}
