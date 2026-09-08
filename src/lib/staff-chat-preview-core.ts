import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { getFileExtension } from "@/lib/file-display";

// Uploaded MIME metadata is untrusted. Require both a supported filename and
// its corresponding binary signature before serving any inline content.
export function getStaffChatPreviewContentType(fileName: string, bytes: Uint8Array): string | null {
  if (!getAttachmentPreviewKind(fileName)) return null;
  const extension = getFileExtension(fileName);
  const startsWith = (signature: readonly number[]) => signature.every((value, index) => bytes[index] === value);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (extension === ".png" && startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if ([".jpg", ".jpeg"].includes(extension) && startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (extension === ".gif" && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (extension === ".webp" && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (extension === ".pdf" && /^%PDF-(?:1\.[0-7]|2\.0)$/.test(ascii(0, 8))) return "application/pdf";
  return null;
}
