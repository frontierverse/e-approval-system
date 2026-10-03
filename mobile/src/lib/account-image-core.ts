import { ApiError } from "./api";
import { safeAttachmentFilename } from "./attachment-file";
import type { AccountImageInfo } from "./types";

export type AccountImageKind = "profile" | "signature";
export type SelectedAccountImage = { uri: string; name: string; size: number; mimeType: string; release: () => void };
export type AccountImageUploadOptions = { kind: AccountImageKind; token: string; image: SelectedAccountImage; signal?: AbortSignal };
export type AccountImageLoadOptions = { kind: AccountImageKind; token: string; updatedAt?: string | null; signal?: AbortSignal };
export type AccountImageSource = { uri: string; release: () => void };
export type AccountImageUploadResult = { ok: true; message: string; image: AccountImageInfo };
export const ACCOUNT_IMAGE_MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const ACCOUNT_IMAGE_MAX_STORED_BYTES = 2 * 1024 * 1024;
export const ACCOUNT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function accountImagePath(kind: AccountImageKind, updatedAt?: string | null) {
  if (kind !== "profile" && kind !== "signature") throw new ApiError("이미지 종류를 확인할 수 없습니다.", 0);
  const path = `/account/${kind === "profile" ? "profile" : "signature"}-image`;
  return updatedAt ? `${path}?v=${encodeURIComponent(updatedAt)}` : path;
}
export function accountImageInputName(kind: AccountImageKind) {
  accountImagePath(kind);
  return kind === "profile" ? "profileImage" : "signatureImage";
}
export function accountImageAbortError() {
  const error = new Error("이미지 작업을 취소했습니다.");
  error.name = "AbortError";
  return error;
}
export function isAccountImageAbortError(error: unknown) { return error instanceof Error && error.name === "AbortError"; }

export function accountImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && [82,73,70,70].every((value,index) => bytes[index] === value) && [87,69,66,80].every((value,index) => bytes[index+8] === value)) return "image/webp";
  return null;
}
export function validateAccountImage(name: string, size: number, bytes: Uint8Array) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new ApiError("비어 있거나 읽을 수 없는 이미지입니다. 다른 파일을 선택하세요.", 0);
  if (size > ACCOUNT_IMAGE_MAX_INPUT_BYTES) throw new ApiError("원본 이미지가 4MB를 초과합니다. 크기를 줄인 뒤 다시 선택하세요.", 0);
  const mimeType = accountImageMime(bytes);
  const extension = name.toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1];
  const expectedType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension ? `image/${extension}` : null;
  if (!mimeType || expectedType !== mimeType) throw new ApiError("실제 JPG, PNG, WEBP 이미지 파일을 선택하세요. 파일 확장자와 형식이 일치해야 합니다.", 0);
  return { name: safeAttachmentFilename(name), size, mimeType };
}
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
export function accountImageResponse(status: number, body: unknown): AccountImageUploadResult {
  const data = object(body);
  if (status < 200 || status >= 300) {
    const message = typeof data?.error === "string" ? data.error : status === 401 ? "로그인이 만료되었습니다. 다시 로그인하세요." : "이미지를 저장하지 못했습니다. 다시 시도하세요.";
    const fields = object(data?.fields);
    throw new ApiError(message, status, fields ? Object.fromEntries(Object.entries(fields).filter(([,value]) => typeof value === "string")) as Record<string,string> : undefined);
  }
  const image = object(data?.image);
  if (data?.ok !== true || typeof data.message !== "string" || !image || typeof image.exists !== "boolean" ||
    !(image.mimeType === null || typeof image.mimeType === "string") || !(image.size === null || (typeof image.size === "number" && Number.isSafeInteger(image.size) && image.size >= 0)) ||
    !(image.updatedAt === null || typeof image.updatedAt === "string")) throw new ApiError("이미지 저장 결과를 확인하지 못했습니다. 새로고침하여 확인하세요.", status);
  return { ok: true, message: data.message, image: { exists: image.exists, mimeType: image.mimeType as string | null, size: image.size as number | null, updatedAt: image.updatedAt as string | null } };
}
export function validateAccountImagePreview(size: number, bytes: Uint8Array, headers: Record<string, unknown>) {
  const header = (name: string) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  const type = String(header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const length = header("content-length");
  const mimeType = accountImageMime(bytes);
  if (!Number.isSafeInteger(size) || size <= 0 || size > ACCOUNT_IMAGE_MAX_STORED_BYTES || !mimeType || type !== mimeType ||
    (typeof length === "string" && /^\d+$/.test(length) && Number(length) !== size)) throw new ApiError("이미지를 완전히 불러오지 못했습니다. 다시 시도하세요.", 0);
  return mimeType;
}
