import type { AttachmentPolicyConfig } from "@/lib/attachment-storage";

export const signatureImageInputName = "signatureImage";
export const signatureImageStoragePrefix = "signature-images/";
export const signatureImageCompressionMimeType = "image/webp";
export const signatureImageCompressionMaxDimension = 1024;
export const signatureImageCompressionQualitySteps = [0.9, 0.82, 0.74, 0.66];
export const signatureImagePolicy: AttachmentPolicyConfig = {
  maxFileCount: 1,
  maxFileSizeMb: 2,
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
};

export function getSignatureImagePolicyText() {
  return "JPG, PNG, WEBP 형식 / 투명 배경 PNG 권장 / 자동 압축 후 2MB 이하";
}
