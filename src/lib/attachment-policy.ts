import "server-only";

import {
  defaultAttachmentPolicy,
  type AttachmentPolicyConfig,
} from "@/lib/attachment-storage";
import { normalizeExtensionList } from "@/lib/attachment-policy-core";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export {
  normalizeExtensionList,
  parseExtensionText,
} from "@/lib/attachment-policy-core";

export const attachmentPolicyId = "default";

export async function getAttachmentPolicy(db: Pick<Prisma.TransactionClient, "attachmentPolicy"> = prisma): Promise<AttachmentPolicyConfig> {
  const policy = await db.attachmentPolicy.findUnique({
    where: {
      id: attachmentPolicyId,
    },
  });

  if (!policy) {
    return createDefaultAttachmentPolicy(db);
  }

  return {
    maxFileCount: policy.maxFileCount,
    maxFileSizeMb: policy.maxFileSizeMb,
    allowedExtensions: normalizeExtensionList(policy.allowedExtensions),
  };
}

export async function upsertAttachmentPolicy(policy: AttachmentPolicyConfig, db: Pick<Prisma.TransactionClient, "attachmentPolicy"> = prisma) {
  const normalizedPolicy = {
    maxFileCount: policy.maxFileCount,
    maxFileSizeMb: policy.maxFileSizeMb,
    allowedExtensions: normalizeExtensionList(policy.allowedExtensions),
  };

  await db.attachmentPolicy.upsert({
    where: {
      id: attachmentPolicyId,
    },
    create: {
      id: attachmentPolicyId,
      ...normalizedPolicy,
    },
    update: normalizedPolicy,
  });

  return normalizedPolicy;
}

async function createDefaultAttachmentPolicy(db: Pick<Prisma.TransactionClient, "attachmentPolicy">) {
  return upsertAttachmentPolicy(defaultAttachmentPolicy, db);
}

/** Pure policy query for mobile reads; the existing web initializer stays unchanged. */
export async function getAttachmentPolicySnapshot(db: Pick<Prisma.TransactionClient, "attachmentPolicy"> = prisma): Promise<AttachmentPolicyConfig> {
  const policy = await db.attachmentPolicy.findUnique({ where: { id: attachmentPolicyId } });
  return policy ? { maxFileCount: policy.maxFileCount, maxFileSizeMb: policy.maxFileSizeMb, allowedExtensions: normalizeExtensionList(policy.allowedExtensions) }
    : { ...defaultAttachmentPolicy, allowedExtensions: [...defaultAttachmentPolicy.allowedExtensions] };
}
