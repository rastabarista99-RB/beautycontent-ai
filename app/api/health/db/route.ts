import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ connected: false }, { status: 503 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ connected: true });
  } catch {
    return NextResponse.json({ connected: false }, { status: 503 });
  }
}
