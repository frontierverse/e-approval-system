import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
});

export const prisma =
  globalForPrisma.prisma &&
  "attachmentPolicy" in globalForPrisma.prisma &&
  "notification" in globalForPrisma.prisma &&
  "resourcePost" in globalForPrisma.prisma &&
  "resourceAttachment" in globalForPrisma.prisma &&
  "resourcePostView" in globalForPrisma.prisma &&
  "loginHistory" in globalForPrisma.prisma
    ? globalForPrisma.prisma
    : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}
