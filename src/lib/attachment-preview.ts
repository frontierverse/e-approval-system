import { getFileExtension } from "@/lib/file-display";

export type AttachmentPreviewKind = "image" | "pdf";

const previewableImageExtensions = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

const previewableImageMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const signableImageExtensions = new Set([".jpeg", ".jpg", ".png"]);
const signableImageMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png"]);
const imageContentTypesByExtension: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function getAttachmentPreviewKind(
  fileName: string,
  mimeType?: string | null,
): AttachmentPreviewKind | null {
  const extension = getFileExtension(fileName);
  const normalizedMimeType = normalizeMimeType(mimeType);

  if (extension === ".pdf" || normalizedMimeType === "application/pdf") {
    return "pdf";
  }

  if (
    previewableImageExtensions.has(extension) ||
    (normalizedMimeType !== null &&
      previewableImageMimeTypes.has(normalizedMimeType))
  ) {
    return "image";
  }

  return null;
}

export function isPreviewableAttachmentFile(
  fileName: string,
  mimeType?: string | null,
) {
  return getAttachmentPreviewKind(fileName, mimeType) !== null;
}

export function isSignableAttachmentFile(
  fileName: string,
  mimeType?: string | null,
) {
  const extension = getFileExtension(fileName);
  const normalizedMimeType = normalizeMimeType(mimeType);

  return (
    extension === ".pdf" ||
    normalizedMimeType === "application/pdf" ||
    signableImageExtensions.has(extension) ||
    (normalizedMimeType !== null && signableImageMimeTypes.has(normalizedMimeType))
  );
}

export function getAttachmentPreviewContentType(
  fileName: string,
  mimeType?: string | null,
) {
  const kind = getAttachmentPreviewKind(fileName, mimeType);

  if (kind === "pdf") {
    return "application/pdf";
  }

  if (kind === "image") {
    const normalizedMimeType = normalizeMimeType(mimeType);

    if (
      normalizedMimeType !== null &&
      previewableImageMimeTypes.has(normalizedMimeType)
    ) {
      return normalizedMimeType === "image/jpg"
        ? "image/jpeg"
        : normalizedMimeType;
    }

    return imageContentTypesByExtension[getFileExtension(fileName)] ?? null;
  }

  return null;
}

function normalizeMimeType(mimeType?: string | null) {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();

  return normalized || null;
}
