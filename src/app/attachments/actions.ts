"use server";

import { requireUser } from "@/lib/auth";
import { getSignedUploadUrlForAttachment } from "@/lib/attachment-storage";

export async function createSignedUploadUrlAction(
  originalName: string,
  mimeType: string,
  options?: { storageKeyPrefix?: string },
) {
  const user = await requireUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const result = await getSignedUploadUrlForAttachment(
    originalName,
    mimeType,
    options,
  );

  if (!result) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    provider: result.provider,
    uploadUrl: result.uploadUrl,
    storageKey: result.storageKey,
  };
}
