"use server";

import { requireUser } from "@/lib/auth";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { getSignedUploadUrlForAttachment } from "@/lib/attachment-storage";
import { getFileExtension } from "@/lib/file-display";

export async function createSignedUploadUrlAction(
  originalName: string,
  mimeType: string,
  size: number,
  options?: { storageKeyPrefix?: string },
) {
  const user = await requireUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const attachmentPolicy = await getAttachmentPolicy();
  const extension = getFileExtension(originalName);
  const allowedExtensions = new Set(
    attachmentPolicy.allowedExtensions.map((value) => value.toLowerCase()),
  );
  const maxFileSize = attachmentPolicy.maxFileSizeMb * 1024 * 1024;

  if (!extension || !allowedExtensions.has(extension)) {
    return {
      ok: false as const,
      error: `허용되지 않는 파일 형식입니다: ${originalName}`,
    };
  }

  if (!Number.isSafeInteger(size) || size <= 0 || size > maxFileSize) {
    return {
      ok: false as const,
      error: `파일은 ${attachmentPolicy.maxFileSizeMb}MB 이하만 등록할 수 있습니다: ${originalName}`,
    };
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
