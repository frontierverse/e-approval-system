export const localAttachmentStorageProvider = "local";
export const vercelBlobAttachmentStorageProvider = "vercel-blob";
export const supabaseStorageAttachmentStorageProvider = "supabase-storage";

export const attachmentStorageProviders = [
  localAttachmentStorageProvider,
  vercelBlobAttachmentStorageProvider,
  supabaseStorageAttachmentStorageProvider,
] as const;

export type AttachmentStorageProvider =
  (typeof attachmentStorageProviders)[number];

export type AttachmentStorageConfig =
  | {
      ok: true;
      provider: AttachmentStorageProvider;
    }
  | {
      ok: false;
      provider: AttachmentStorageProvider | null;
      message: string;
    };

type AttachmentStorageEnv = Record<string, string | undefined>;

export function normalizeAttachmentStorageEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  const first = trimmed.at(0);
  const last = trimmed.at(-1);

  if (
    trimmed.length >= 2 &&
    ((first === `"` && last === `"`) || (first === `'` && last === `'`))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function resolveAttachmentStorageProvider(
  value: unknown,
): AttachmentStorageProvider | null {
  const normalizedValue = normalizeAttachmentStorageEnvValue(value);

  if (!normalizedValue) {
    return localAttachmentStorageProvider;
  }

  const provider = normalizedValue.toLowerCase();

  if (provider === localAttachmentStorageProvider) {
    return localAttachmentStorageProvider;
  }

  if (provider === vercelBlobAttachmentStorageProvider) {
    return vercelBlobAttachmentStorageProvider;
  }

  if (provider === supabaseStorageAttachmentStorageProvider) {
    return supabaseStorageAttachmentStorageProvider;
  }

  return null;
}

export function getAttachmentStorageConfig(
  env: AttachmentStorageEnv,
): AttachmentStorageConfig {
  const provider = resolveAttachmentStorageProvider(
    env.ATTACHMENT_STORAGE_DRIVER,
  );

  if (!provider) {
    return {
      ok: false,
      provider: null,
      message:
        "ATTACHMENT_STORAGE_DRIVER must be local, vercel-blob, or supabase-storage.",
    };
  }

  if (provider === localAttachmentStorageProvider && env.VERCEL) {
    return {
      ok: false,
      provider,
      message:
        "ATTACHMENT_STORAGE_DRIVER must be supabase-storage or vercel-blob on Vercel.",
    };
  }

  if (
    provider === vercelBlobAttachmentStorageProvider &&
    !env.BLOB_READ_WRITE_TOKEN?.trim()
  ) {
    return {
      ok: false,
      provider,
      message:
        "BLOB_READ_WRITE_TOKEN is required when ATTACHMENT_STORAGE_DRIVER is vercel-blob.",
    };
  }

  if (provider === supabaseStorageAttachmentStorageProvider) {
    const supabaseUrl = normalizeAttachmentStorageEnvValue(
      env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    );

    if (!supabaseUrl) {
      return {
        ok: false,
        provider,
        message:
          "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required when ATTACHMENT_STORAGE_DRIVER is supabase-storage.",
      };
    }

    if (!normalizeAttachmentStorageEnvValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
      return {
        ok: false,
        provider,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is required when ATTACHMENT_STORAGE_DRIVER is supabase-storage.",
      };
    }

    if (!normalizeAttachmentStorageEnvValue(env.SUPABASE_STORAGE_BUCKET)) {
      return {
        ok: false,
        provider,
        message:
          "SUPABASE_STORAGE_BUCKET is required when ATTACHMENT_STORAGE_DRIVER is supabase-storage.",
      };
    }
  }

  return {
    ok: true,
    provider,
  };
}

export function getAttachmentStorageKeyPrefix(
  provider: AttachmentStorageProvider,
) {
  if (
    provider === vercelBlobAttachmentStorageProvider ||
    provider === supabaseStorageAttachmentStorageProvider
  ) {
    return "attachments/";
  }

  return "";
}
