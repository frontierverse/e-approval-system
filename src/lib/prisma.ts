import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const requiredPrismaDelegates = [
  "attachmentPolicy",
  "cafeItem",
  "companyBusinessInfo",
  "notification",
  "resourcePost",
  "resourceAttachment",
  "resourcePostView",
  "workSchedule",
  "workFeatureUpdate",
  "youth",
  "youthFamilyContact",
  "youthSpecialNote",
  "youthLearningSchedule",
  "youthCommonSchedule",
  "youthRule",
  "staffLeaveLedger",
  "loginHistory",
  "problemUnit",
  "questionBankProblem",
  "questionBankPdf",
  "worksheetGeneration",
  "worksheetProblem",
] as const;

const requiredYouthLearningScheduleFields = [
  "recurrenceSourceDate",
  "recurrenceWeekdays",
] as const;
const requiredYouthFields = ["birthDate"] as const;
const requiredWorkScheduleFields = ["scheduleDate"] as const;
const requiredUserFields = ["birthDate", "hireDate", "resignationDate"] as const;

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
});

const cachedPrisma = globalForPrisma.prisma;

export const prisma = isReusablePrismaClient(cachedPrisma)
  ? cachedPrisma
  : new PrismaClient({ adapter });

if (cachedPrisma && cachedPrisma !== prisma) {
  void cachedPrisma.$disconnect().catch(() => undefined);
}

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

function isReusablePrismaClient(
  client: PrismaClient | undefined,
): client is PrismaClient {
  if (!client) {
    return false;
  }

  return (
    hasRequiredPrismaDelegates(client) &&
    hasRequiredYouthFields(client) &&
    hasRequiredYouthLearningScheduleFields(client) &&
    hasRequiredWorkScheduleFields(client) &&
    hasRequiredUserFields(client)
  );
}

function hasRequiredPrismaDelegates(client: PrismaClient) {
  const record = client as unknown as Record<string, unknown>;

  return requiredPrismaDelegates.every((delegate) => delegate in record);
}

function hasRequiredYouthLearningScheduleFields(client: PrismaClient) {
  const model = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: {
          YouthLearningSchedule?: {
            fields?: Array<{ name?: string }>;
          };
        };
      };
    }
  )._runtimeDataModel?.models?.YouthLearningSchedule;
  const fieldNames = new Set(
    (model?.fields ?? [])
      .map((field) => field.name)
      .filter((name): name is string => typeof name === "string"),
  );

  return requiredYouthLearningScheduleFields.every((field) =>
    fieldNames.has(field),
  );
}

function hasRequiredYouthFields(client: PrismaClient) {
  const model = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: {
          Youth?: {
            fields?: Array<{ name?: string }>;
          };
        };
      };
    }
  )._runtimeDataModel?.models?.Youth;
  const fieldNames = new Set(
    (model?.fields ?? [])
      .map((field) => field.name)
      .filter((name): name is string => typeof name === "string"),
  );

  return requiredYouthFields.every((field) => fieldNames.has(field));
}

function hasRequiredUserFields(client: PrismaClient) {
  const model = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: {
          User?: {
            fields?: Array<{ name?: string }>;
          };
        };
      };
    }
  )._runtimeDataModel?.models?.User;
  const fieldNames = new Set(
    (model?.fields ?? [])
      .map((field) => field.name)
      .filter((name): name is string => typeof name === "string"),
  );

  return requiredUserFields.every((field) => fieldNames.has(field));
}

function hasRequiredWorkScheduleFields(client: PrismaClient) {
  const model = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: {
          WorkSchedule?: {
            fields?: Array<{ name?: string }>;
          };
        };
      };
    }
  )._runtimeDataModel?.models?.WorkSchedule;
  const fieldNames = new Set(
    (model?.fields ?? [])
      .map((field) => field.name)
      .filter((name): name is string => typeof name === "string"),
  );

  return requiredWorkScheduleFields.every((field) => fieldNames.has(field));
}
