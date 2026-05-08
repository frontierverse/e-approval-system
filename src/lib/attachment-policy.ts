import "server-only";

import {
  defaultAttachmentPolicy,
  type AttachmentPolicyConfig,
} from "@/lib/attachment-storage";
import { normalizeExtensionList } from "@/lib/attachment-policy-core";
import { prisma } from "@/lib/prisma";

export {
  normalizeExtensionList,
  parseExtensionText,
} from "@/lib/attachment-policy-core";

export const attachmentPolicyId = "default";

export async function getAttachmentPolicy(): Promise<AttachmentPolicyConfig> {
  const policy = await prisma.attachmentPolicy.findUnique({
    where: {
      id: attachmentPolicyId,
    },
  });

  if (!policy) {
    return createDefaultAttachmentPolicy();
  }

  return {
    maxFileCount: policy.maxFileCount,
    maxFileSizeMb: policy.maxFileSizeMb,
    allowedExtensions: normalizeExtensionList(policy.allowedExtensions),
  };
}

export async function upsertAttachmentPolicy(policy: AttachmentPolicyConfig) {
  const normalizedPolicy = {
    maxFileCount: policy.maxFileCount,
    maxFileSizeMb: policy.maxFileSizeMb,
    allowedExtensions: normalizeExtensionList(policy.allowedExtensions),
  };

  await prisma.attachmentPolicy.upsert({
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

async function createDefaultAttachmentPolicy() {
  return upsertAttachmentPolicy(defaultAttachmentPolicy);
}
