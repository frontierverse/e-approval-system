import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeAttachmentStorageEnvValue } from "@/lib/attachment-storage-core";

const bytesPerMb = 1024 * 1024;
const bytesPerGb = bytesPerMb * 1024;
const defaultDatabaseQuotaBytes = 500 * bytesPerMb;
const defaultStorageQuotaBytes = bytesPerGb;

export type SystemUsageMetric = {
  label: string;
  limitLabel: string;
  usedLabel: string;
  usedPercent: number;
};

export type SystemUsageSummary = {
  database: SystemUsageMetric;
  storage: SystemUsageMetric;
};

export async function getSystemUsageSummary(): Promise<SystemUsageSummary> {
  const [databaseBytes, storageBytes] = await Promise.all([
    getDatabaseUsageBytes(),
    getStorageUsageBytes(),
  ]);

  return {
    database: createSystemUsageMetric({
      label: "DB",
      limitBytes: getQuotaBytesFromEnv(
        "SUPABASE_DATABASE_LIMIT_MB",
        defaultDatabaseQuotaBytes,
      ),
      usedBytes: databaseBytes,
    }),
    storage: createSystemUsageMetric({
      label: "스토리지",
      limitBytes: getQuotaBytesFromEnv(
        "SUPABASE_STORAGE_LIMIT_MB",
        defaultStorageQuotaBytes,
      ),
      usedBytes: storageBytes,
    }),
  };
}

async function getDatabaseUsageBytes() {
  const rows = await prisma.$queryRaw<Array<{ bytes: bigint }>>`
    SELECT pg_database_size(current_database())::bigint AS bytes
  `;

  return toNumber(rows[0]?.bytes);
}

async function getStorageUsageBytes() {
  const bucket = normalizeAttachmentStorageEnvValue(
    process.env.SUPABASE_STORAGE_BUCKET,
    "SUPABASE_STORAGE_BUCKET",
  );

  if (!bucket) {
    return getAppRecordedStorageUsageBytes();
  }

  try {
    const [table] = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
      SELECT to_regclass('storage.objects')::text AS regclass
    `;

    if (!table?.regclass) {
      return getAppRecordedStorageUsageBytes();
    }

    const rows = await prisma.$queryRaw<Array<{ bytes: bigint }>>`
      SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint AS bytes
      FROM storage.objects
      WHERE bucket_id = ${bucket}
    `;

    return toNumber(rows[0]?.bytes);
  } catch {
    return getAppRecordedStorageUsageBytes();
  }
}

async function getAppRecordedStorageUsageBytes() {
  const [approvalAttachments, resourceAttachments, users] = await Promise.all([
    prisma.attachment.aggregate({
      _sum: {
        size: true,
      },
    }),
    prisma.resourceAttachment.aggregate({
      _sum: {
        size: true,
      },
    }),
    prisma.user.aggregate({
      _sum: {
        profileImageSize: true,
        signatureImageSize: true,
      },
    }),
  ]);

  return (
    toNumber(approvalAttachments._sum.size) +
    toNumber(resourceAttachments._sum.size) +
    toNumber(users._sum.profileImageSize) +
    toNumber(users._sum.signatureImageSize)
  );
}

function createSystemUsageMetric({
  label,
  limitBytes,
  usedBytes,
}: {
  label: string;
  limitBytes: number;
  usedBytes: number;
}): SystemUsageMetric {
  return {
    label,
    limitLabel: formatUsageLimit(limitBytes),
    usedLabel: formatUsageValue(usedBytes),
    usedPercent: getUsedPercent(usedBytes, limitBytes),
  };
}

function getQuotaBytesFromEnv(key: string, fallback: number) {
  const value = Number(process.env[key]?.trim() ?? "");

  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.round(value * bytesPerMb);
}

function getUsedPercent(usedBytes: number, limitBytes: number) {
  if (limitBytes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10);
}

function formatUsageValue(bytes: number) {
  if (bytes < bytesPerMb) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < bytesPerGb) {
    return `${(bytes / bytesPerMb).toFixed(1)} MB`;
  }

  return `${(bytes / bytesPerGb).toFixed(1)} GB`;
}

function formatUsageLimit(bytes: number) {
  if (bytes >= bytesPerGb && bytes % bytesPerGb === 0) {
    return `${bytes / bytesPerGb} GB`;
  }

  if (bytes >= bytesPerMb && bytes % bytesPerMb === 0) {
    return `${bytes / bytesPerMb} MB`;
  }

  return formatUsageValue(bytes);
}

function toNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }

  return 0;
}
