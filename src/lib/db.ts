import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://cgchecker:cgchecker@localhost:5432/cgchecker",
    }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function hasScoringConfigDelegate(client: PrismaClient | undefined): client is PrismaClient {
  return !!client && "scoringConfig" in (client as unknown as Record<string, unknown>);
}

export const prisma =
  hasScoringConfigDelegate(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
