import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __beautyContentPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__beautyContentPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__beautyContentPrisma = prisma;
}
