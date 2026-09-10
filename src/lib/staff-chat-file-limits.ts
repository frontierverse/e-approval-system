export const staffChatFileMaxBytes = 4 * 1024 * 1024;
export const staffChatZipMaxBytes = 100 * 1024 * 1024;
export const staffChatChunkSize = staffChatFileMaxBytes;

export function isStaffChatZip(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

export function getStaffChatFileSizeLimit(name: string, policy: { maxFileSize: number; zipMaxFileSize: number }): number {
  return isStaffChatZip(name) ? policy.zipMaxFileSize : policy.maxFileSize;
}
