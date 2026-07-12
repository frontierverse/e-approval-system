import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Application-level encryption for attachment files at rest.
//
// Files are encrypted with AES-256-GCM before they are written to the storage
// provider (local disk, Vercel Blob, Supabase Storage) and decrypted when they
// are read back through the app. The point is that if the raw storage is ever
// leaked (a dumped bucket, a stolen backup, a misconfigured public bucket, a
// leaked service-role key) the files are ciphertext and useless without the
// key — which is kept in the app host env, separate from the storage provider.
//
// It intentionally does NOT protect a normal logged-in download: the app holds
// the key and decrypts for the user. That path is covered by the download
// audit log instead.
//
// Stored blob layout:
//   magic(4) | iv(12) | authTag(16) | ciphertext(...)
// The magic prefix lets reads auto-detect encrypted vs. legacy plaintext files,
// so existing files keep working and encryption can be rolled out gradually.

type EncryptionEnv = Record<string, string | undefined>;

const ENCRYPTION_MAGIC = Buffer.from("ENC1", "ascii");
const IV_LENGTH = 12; // 96-bit nonce, the recommended size for GCM
const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH = ENCRYPTION_MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH;
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // AES-256

export const attachmentEncryptionKeyEnvVar = "ATTACHMENT_ENCRYPTION_KEY";

export function parseAttachmentEncryptionKey(
  rawValue: string | undefined | null,
): Buffer | null {
  const raw =
    typeof rawValue === "string"
      ? rawValue.trim().replace(/^"([\s\S]*)"$/, "$1").trim()
      : "";

  if (!raw) {
    return null;
  }

  // Accept a 64-char hex key or a base64-encoded key (base64 is preferred).
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${attachmentEncryptionKeyEnvVar} must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }

  return key;
}

export function getAttachmentEncryptionKey(
  env: EncryptionEnv = process.env,
): Buffer | null {
  return parseAttachmentEncryptionKey(env[attachmentEncryptionKeyEnvVar]);
}

export function isAttachmentEncryptionEnabled(
  env: EncryptionEnv = process.env,
): boolean {
  return getAttachmentEncryptionKey(env) !== null;
}

export function isEncryptedAttachmentBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= HEADER_LENGTH &&
    buffer.subarray(0, ENCRYPTION_MAGIC.length).equals(ENCRYPTION_MAGIC)
  );
}

export function encryptAttachmentBuffer(
  plaintext: Buffer,
  env: EncryptionEnv = process.env,
): Buffer {
  const key = getAttachmentEncryptionKey(env);

  // Encryption is opt-in: with no key configured, store files as-is so that
  // deployments that have not set a key keep working unchanged.
  if (!key) {
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([ENCRYPTION_MAGIC, iv, authTag, ciphertext]);
}

export function decryptAttachmentBuffer(
  buffer: Buffer,
  env: EncryptionEnv = process.env,
): Buffer {
  // Legacy plaintext files (no magic prefix) are returned untouched.
  if (!isEncryptedAttachmentBuffer(buffer)) {
    return buffer;
  }

  const key = getAttachmentEncryptionKey(env);

  if (!key) {
    throw new Error(
      `Encrypted attachment found but ${attachmentEncryptionKeyEnvVar} is not configured.`,
    );
  }

  const iv = buffer.subarray(
    ENCRYPTION_MAGIC.length,
    ENCRYPTION_MAGIC.length + IV_LENGTH,
  );
  const authTag = buffer.subarray(
    ENCRYPTION_MAGIC.length + IV_LENGTH,
    HEADER_LENGTH,
  );
  const ciphertext = buffer.subarray(HEADER_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // decipher.final() throws if the auth tag fails, i.e. if the ciphertext was
  // tampered with or the wrong key was used.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
