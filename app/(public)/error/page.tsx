import Link from "next/link";

import { Card } from "@/components/ui/card";

type ErrorPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function ErrorPage({ searchParams }: ErrorPageProps) {
  const { reason } = await searchParams;
  const isConfirmationError = reason === "confirmation";

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <Card className="w-full max-w-md">
        <p className="text-sm font-medium text-error">Account access</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">We couldn&apos;t complete that</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {isConfirmationError
            ? "That confirmation link is invalid or has expired. Please request a new email or try signing in."
            : "Something went wrong while opening this page. Please try again."}
        </p>
        <Link href="/login" className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark">
          Return to sign in
        </Link>
      </Card>
    </main>
  );
}
