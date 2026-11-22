import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/error?reason=confirmation", url.origin));
  }

  const allowedTypes: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change"];
  if (!allowedTypes.includes(type as EmailOtpType)) {
    return NextResponse.redirect(new URL("/error?reason=confirmation", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(new URL("/error?reason=confirmation", url.origin));
  }

  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
