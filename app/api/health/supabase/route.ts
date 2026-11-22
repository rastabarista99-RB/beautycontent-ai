import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return NextResponse.json({ connected: false }, { status: 503 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.getSession();

  if (error) {
    return NextResponse.json({ connected: false }, { status: 503 });
  }

  return NextResponse.json({ connected: true });
}
