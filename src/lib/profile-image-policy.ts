import type { AttachmentPolicyConfig } from "@/lib/attachment-storage";

export const profileImageInputName = "profileImage";
export const profileImageStoragePrefix = "profile-images/";
export const profileImageCompressionMimeType = "image/webp";
export const profileImageCompressionMaxDimension = 768;
export const profileImageCompressionQualitySteps = [0.82, 0.72, 0.62, 0.52];
export const profileImagePolicy: AttachmentPolicyConfig = {
  maxFileCount: 1,
  maxFileSizeMb: 2,
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
};

export function getProfileImagePolicyText() {
  return "JPG, PNG, WEBP 형식 / 자동 압축 후 2MB 이하";
}
