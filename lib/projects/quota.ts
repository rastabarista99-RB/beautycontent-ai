import "server-only";

import { prisma } from "@/lib/db/prisma";

const dailyGenerationLimit = 5;

export type QuotaReservationRow = {
  allowed: boolean;
  remaining_attempts: number;
  reset_at: string;
};

export async function reserveDailyGenerationAttempt(
  userId: string,
): Promise<QuotaReservationRow[]> {
  const inserted = await prisma.$queryRaw<Array<{ attempts: number; reset_at: Date }>>`
    INSERT INTO "generation_daily_usage" ("user_id", "usage_date_utc", "attempts")
    VALUES (${userId}::uuid, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1)
    ON CONFLICT ("user_id", "usage_date_utc")
    DO UPDATE SET "attempts" = "generation_daily_usage"."attempts" + 1
    WHERE "generation_daily_usage"."attempts" < ${dailyGenerationLimit}
    RETURNING
      "attempts",
      (((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC') AS "reset_at"
  `;

  if (inserted.length === 1) {
    const row = inserted[0];
    return [
      {
        allowed: true,
        remaining_attempts: dailyGenerationLimit - Number(row.attempts),
        reset_at: row.reset_at instanceof Date ? row.reset_at.toISOString() : String(row.reset_at),
      },
    ];
  }

  const resetRows = await prisma.$queryRaw<Array<{ reset_at: Date }>>`
    SELECT (((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC') AS "reset_at"
  `;
  const resetAt = resetRows[0]?.reset_at;

  return [
    {
      allowed: false,
      remaining_attempts: 0,
      reset_at: resetAt instanceof Date ? resetAt.toISOString() : String(resetAt),
    },
  ];
}
