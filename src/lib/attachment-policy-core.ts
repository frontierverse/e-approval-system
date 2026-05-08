export const defaultAllowedAttachmentExtensions = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".hwp",
  ".hwpx",
];

export function parseExtensionText(value: string) {
  return normalizeExtensionList(
    value
      .split(/[\s,]+/)
      .map((extension) => extension.trim())
      .filter(Boolean),
  );
}

export function normalizeExtensionList(
  value: unknown,
  fallback = defaultAllowedAttachmentExtensions,
) {
  const rawExtensions = Array.isArray(value)
    ? value.map((extension) => String(extension))
    : fallback;

  return Array.from(
    new Set(
      rawExtensions
        .map((extension) => extension.trim().toLowerCase())
        .map((extension) =>
          extension.startsWith(".") ? extension : `.${extension}`,
        )
        .filter((extension) => /^\.[a-z0-9]{1,10}$/.test(extension)),
    ),
  ).sort((a, b) => a.localeCompare(b, "en-US"));
}
