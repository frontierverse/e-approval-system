export type AttachmentTransferAction = "save" | "share";
export type AttachmentTransferOptions = {
  id: string;
  token: string;
  action: AttachmentTransferAction;
  onProgress?: (fraction: number | null) => void;
};
export type AttachmentTransfer = { promise: Promise<string | null>; cancel: () => void };

export function attachmentDownloadPath(id: string) {
  return `/attachments/${encodeURIComponent(id)}/download`;
}

export function attachmentFileSize(size: number | null | undefined) {
  if (size === null || size === undefined || !Number.isFinite(size) || size < 0) return "크기 확인 중";
  if (size < 1024) return `${Math.round(size)}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function utf8Length(value: string) {
  let bytes = 0;
  for (const letter of value) {
    const code = letter.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

// Keep the server's original extension, while making the name one safe path segment.
export function safeAttachmentFilename(value: string) {
  const cleaned = value.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "");
  const filename = cleaned || "첨부파일";
  const match = filename.match(/(\.[\p{L}\p{N}]{1,12})$/u);
  const extension = match?.[1] ?? "";
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  // Count UTF-8 bytes: Korean file names otherwise exceed common 255-byte limits.
  let limited = "";
  for (const letter of stem) {
    if (utf8Length(limited + letter + extension) > 180) break;
    limited += letter;
  }
  return (limited || "첨부파일") + extension;
}

export function availableAttachmentFilename(filename: string, occupied: Iterable<string>) {
  const safe = safeAttachmentFilename(filename);
  const names = new Set(occupied);
  if (!names.has(safe)) return safe;
  const index = safe.lastIndexOf(".");
  const stem = index > 0 ? safe.slice(0, index) : safe;
  const extension = index > 0 ? safe.slice(index) : "";
  let suffix = 1;
  while (names.has(`${stem} (${suffix})${extension}`)) suffix += 1;
  return `${stem} (${suffix})${extension}`;
}

function header(headers: Record<string, unknown>, name: string) {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return typeof value === "string" ? value : "";
}

export function attachmentDownloadInfo(headers: Record<string, unknown>, id: string) {
  const disposition = header(headers, "content-disposition");
  const encoded = disposition.match(/(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i);
  let filename = "";
  if (encoded) {
    const parts = (encoded[1] ?? encoded[2]).trim().match(/^utf-8'[^']*'(.*)$/i);
    if (parts) {
      try { filename = decodeURIComponent(parts[1]); } catch { /* Fall back to the ASCII name. */ }
    }
  }
  if (!filename) {
    const plain = disposition.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i);
    filename = plain ? (plain[1] ?? plain[2]).replace(/\\(["\\])/g, "$1").trim() : "";
  }
  if (!filename) throw new Error("첨부파일 정보를 확인하지 못했습니다. 다시 시도하세요.");
  const rawType = header(headers, "content-type").split(";")[0].trim().toLowerCase();
  const mimeType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(rawType) ? rawType : "application/octet-stream";
  const rawSize = header(headers, "content-length");
  const size = /^\d+$/.test(rawSize) && Number.isSafeInteger(Number(rawSize)) ? Number(rawSize) : null;
  return { name: safeAttachmentFilename(filename || `첨부파일-${id}`), mimeType, size };
}

export function transferProgress(received: number, total: number) {
  if (!Number.isFinite(received) || received < 0 || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(1, Math.max(0, received / total));
}

export function isAttachmentTransferCancellation(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return error.name === "AbortError" || code === "ERR_PICKER_CANCELLED" || code === "ERR_FILE_PICKING_CANCELLED";
}
