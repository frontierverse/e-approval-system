import "server-only";

import { del, get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultAllowedAttachmentExtensions } from "@/lib/attachment-policy-core";
import {
  type AttachmentStorageProvider,
  getAttachmentStorageDiagnostics,
  getAttachmentStorageConfig,
  getAttachmentStorageKeyPrefix,
  getFirstAttachmentStorageEnvValue,
  localAttachmentStorageProvider,
  normalizeAttachmentStorageEnvValue,
  resolveAttachmentStorageProvider,
  supabaseStorageAttachmentStorageProvider,
  vercelBlobAttachmentStorageProvider,
} from "@/lib/attachment-storage-core";

export type AttachmentPolicyConfig = {
  maxFileCount: number;
  maxFileSizeMb: number;
  allowedExtensions: string[];
};

export const defaultMaxAttachmentFiles = 10;
export const defaultMaxAttachmentFileSizeMb = 30;
export const defaultAttachmentPolicy: AttachmentPolicyConfig = {
  maxFileCount: defaultMaxAttachmentFiles,
  maxFileSizeMb: defaultMaxAttachmentFileSizeMb,
  allowedExtensions: defaultAllowedAttachmentExtensions,
};

export type PreparedAttachmentFile = {
  originalName: string;
  storageProvider: AttachmentStorageProvider;
  storageKey: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

export type ClientUploadedAttachmentInput = {
  originalName: string;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

export type StoredAttachmentRef = {
  storageKey: string;
  storageProvider?: AttachmentStorageProvider | string | null;
};

export type StoredAttachmentFile = {
  body: ReadableStream<Uint8Array>;
  size?: number;
  mimeType?: string;
};

const uploadRoot = path.join(process.cwd(), "uploads", "attachments");

export async function prepareAttachmentFiles(
  values: FormDataEntryValue[],
  policy: AttachmentPolicyConfig = defaultAttachmentPolicy,
  options: {
    storageKeyPrefix?: string;
  } = {},
) {
  const files = values.filter(isNonEmptyFile);

  if (files.length === 0) {
    return {
      files: [],
    };
  }

  const storageConfig = getAttachmentStorageConfig(process.env);

  if (!storageConfig.ok) {
    console.error(
      "Invalid attachment storage configuration",
      getAttachmentStorageDiagnostics(process.env),
    );

    return {
      error: "첨부파일 저장소 설정이 올바르지 않습니다. 관리자에게 문의하세요.",
      files: [],
    };
  }

  const storageProvider = storageConfig.provider;
  const maxFileSize = policy.maxFileSizeMb * 1024 * 1024;
  const allowedExtensions = policy.allowedExtensions.map((extension) =>
    extension.toLowerCase(),
  );

  if (files.length > policy.maxFileCount) {
    return {
      error: `첨부파일은 최대 ${policy.maxFileCount}개까지 등록할 수 있습니다.`,
      files: [],
    };
  }

  const preparedFiles: PreparedAttachmentFile[] = [];

  for (const file of files) {
    const originalName = sanitizeOriginalName(file.name);
    const extension = path.extname(originalName).toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      return {
        error: `허용되지 않는 파일 형식입니다: ${originalName}`,
        files: [],
      };
    }

    if (file.size > maxFileSize) {
      return {
        error: `파일은 ${policy.maxFileSizeMb}MB 이하만 등록할 수 있습니다: ${originalName}`,
        files: [],
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    preparedFiles.push({
      originalName,
      storageProvider,
      storageKey: createStorageKey(
        extension,
        storageProvider,
        options.storageKeyPrefix,
      ),
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      buffer,
    });
  }

  return {
    files: preparedFiles,
  };
}

export function prepareClientUploadedAttachmentFiles(
  values: unknown,
  policy: AttachmentPolicyConfig = defaultAttachmentPolicy,
  existingFileCount = 0,
): { files: PreparedAttachmentFile[]; error?: string | null } {
  if (!Array.isArray(values)) {
    return {
      error: "첨부파일 정보가 올바르지 않습니다.",
      files: [],
    };
  }

  if (values.length + existingFileCount > policy.maxFileCount) {
    return {
      error: `첨부파일은 최대 ${policy.maxFileCount}개까지 등록할 수 있습니다.`,
      files: [],
    };
  }

  const allowedExtensions = policy.allowedExtensions.map((extension) =>
    extension.toLowerCase(),
  );
  const maxFileSize = policy.maxFileSizeMb * 1024 * 1024;
  const files: PreparedAttachmentFile[] = [];

  for (const value of values) {
    if (!isClientUploadedAttachmentInput(value)) {
      return {
        error: "첨부파일 정보가 올바르지 않습니다.",
        files: [],
      };
    }

    const originalName = sanitizeOriginalName(value.originalName);
    const extension = path.extname(originalName).toLowerCase();
    const storageProvider = resolveAttachmentStorageProvider(
      value.storageProvider,
    );

    if (storageProvider !== supabaseStorageAttachmentStorageProvider) {
      return {
        error: "첨부파일 저장소 정보가 올바르지 않습니다.",
        files: [],
      };
    }

    if (!allowedExtensions.includes(extension)) {
      return {
        error: `허용되지 않는 파일 형식입니다: ${originalName}`,
        files: [],
      };
    }

    if (!isValidSupabaseAttachmentStorageKey(value.storageKey, extension)) {
      return {
        error: "첨부파일 저장 경로가 올바르지 않습니다.",
        files: [],
      };
    }

    if (!Number.isSafeInteger(value.size) || value.size <= 0) {
      return {
        error: `첨부파일 크기 정보가 올바르지 않습니다: ${originalName}`,
        files: [],
      };
    }

    if (value.size > maxFileSize) {
      return {
        error: `파일은 ${policy.maxFileSizeMb}MB 이하만 등록할 수 있습니다: ${originalName}`,
        files: [],
      };
    }

    files.push({
      originalName,
      storageProvider,
      storageKey: value.storageKey,
      mimeType: value.mimeType || "application/octet-stream",
      size: value.size,
      buffer: Buffer.alloc(0),
    });
  }

  return { files };
}

export async function persistAttachmentFiles(files: PreparedAttachmentFile[]) {
  const writtenFiles: StoredAttachmentRef[] = [];

  try {
    for (const file of files) {
      await persistAttachmentFile(file);
      writtenFiles.push(file);
    }
  } catch (error) {
    await removeStoredAttachmentFiles(writtenFiles);
    throw error;
  }
}

export async function removeStoredAttachmentFiles(
  attachments: Array<string | StoredAttachmentRef>,
) {
  const refs = attachments.map(toStoredAttachmentRef);
  const localKeys = refs
    .filter(
      (ref) => ref.storageProvider === localAttachmentStorageProvider,
    )
    .map((ref) => ref.storageKey);
  const vercelBlobKeys = refs
    .filter(
      (ref) => ref.storageProvider === vercelBlobAttachmentStorageProvider,
    )
    .map((ref) => ref.storageKey);
  const supabaseStorageKeys = refs
    .filter(
      (ref) =>
        ref.storageProvider === supabaseStorageAttachmentStorageProvider,
    )
    .map((ref) => ref.storageKey);

  await Promise.all(
    localKeys.map((storageKey) =>
      rm(resolveAttachmentPath(storageKey), { force: true }),
    ),
  );

  if (vercelBlobKeys.length > 0) {
    await del(vercelBlobKeys, {
      token: getVercelBlobToken(),
    });
  }

  if (supabaseStorageKeys.length > 0) {
    await deleteSupabaseStorageFiles(supabaseStorageKeys);
  }
}

export async function readStoredAttachmentFile(
  attachment: string | StoredAttachmentRef,
): Promise<StoredAttachmentFile> {
  const ref = toStoredAttachmentRef(attachment);

  if (ref.storageProvider === vercelBlobAttachmentStorageProvider) {
    const blob = await get(ref.storageKey, {
      access: "private",
      token: getVercelBlobToken(),
    });

    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      throw new Error("Attachment blob not found");
    }

    return {
      body: blob.stream,
      size: blob.blob.size,
      mimeType: blob.blob.contentType,
    };
  }

  if (ref.storageProvider === supabaseStorageAttachmentStorageProvider) {
    const response = await fetch(
      getSupabaseStorageObjectUrl("privateDownload", ref.storageKey),
      {
        headers: getSupabaseStorageHeaders(),
      },
    );

    if (!response.ok || !response.body) {
      throw new Error("Attachment object not found");
    }

    return {
      body: response.body,
      size: Number(response.headers.get("content-length")) || undefined,
      mimeType: response.headers.get("content-type") ?? undefined,
    };
  }

  const fileBuffer = await readFile(resolveAttachmentPath(ref.storageKey));

  return {
    body: bufferToReadableStream(fileBuffer),
    size: fileBuffer.byteLength,
  };
}

export function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isNonEmptyFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && value.size > 0;
}

function isClientUploadedAttachmentInput(
  value: unknown,
): value is ClientUploadedAttachmentInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<ClientUploadedAttachmentInput>;

  return (
    typeof record.originalName === "string" &&
    typeof record.storageProvider === "string" &&
    typeof record.storageKey === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.size === "number"
  );
}

function isValidSupabaseAttachmentStorageKey(
  storageKey: string,
  extension: string,
) {
  const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `^attachments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}${escapedExtension}$`,
    "i",
  ).test(storageKey);
}

function sanitizeOriginalName(name: string) {
  const basename = path.basename(name).replace(/[\\/]/g, "").trim();

  return basename.slice(0, 180) || "attachment";
}

async function persistAttachmentFile(file: PreparedAttachmentFile) {
  if (file.storageProvider === vercelBlobAttachmentStorageProvider) {
    await put(file.storageKey, file.buffer, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.mimeType,
      token: getVercelBlobToken(),
    });

    return;
  }

  if (file.storageProvider === supabaseStorageAttachmentStorageProvider) {
    const response = await fetch(
      getSupabaseStorageObjectUrl("upload", file.storageKey),
      {
        method: "POST",
        headers: {
          ...getSupabaseStorageHeaders(),
          "Content-Type": file.mimeType,
          "x-upsert": "false",
        },
        body: new Blob([new Uint8Array(file.buffer)], {
          type: file.mimeType,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await getSupabaseStorageErrorMessage(response));
    }

    return;
  }

  const filePath = resolveAttachmentPath(file.storageKey);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, file.buffer);
}

function createStorageKey(
  extension: string,
  provider: AttachmentStorageProvider,
  storageKeyPrefix?: string,
) {
  const prefix = normalizeStorageKeyPrefix(
    storageKeyPrefix ?? getAttachmentStorageKeyPrefix(provider),
  );

  return `${prefix}${randomUUID()}${extension}`;
}

function toStoredAttachmentRef(
  attachment: string | StoredAttachmentRef,
): Required<StoredAttachmentRef> {
  if (typeof attachment === "string") {
    return {
      storageKey: attachment,
      storageProvider: localAttachmentStorageProvider,
    };
  }

  const storageProvider =
    resolveAttachmentStorageProvider(attachment.storageProvider) ??
    localAttachmentStorageProvider;

  return {
    storageKey: attachment.storageKey,
    storageProvider,
  };
}

function getVercelBlobToken() {
  const token = normalizeAttachmentStorageEnvValue(
    process.env.BLOB_READ_WRITE_TOKEN,
    "BLOB_READ_WRITE_TOKEN",
  );

  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required.");
  }

  return token;
}

async function deleteSupabaseStorageFiles(storageKeys: string[]) {
  const response = await fetch(getSupabaseStorageBucketObjectUrl(), {
    method: "DELETE",
    headers: {
      ...getSupabaseStorageHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prefixes: storageKeys,
    }),
  });

  if (!response.ok) {
    throw new Error(await getSupabaseStorageErrorMessage(response));
  }
}

function getSupabaseStorageObjectUrl(
  objectRoute: "upload" | "privateDownload",
  storageKey: string,
) {
  const bucket = encodeURIComponent(getSupabaseStorageBucket());
  const normalizedKey = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const route =
    objectRoute === "privateDownload" ? "object/authenticated" : "object";

  return `${getSupabaseStorageBaseUrl()}/${route}/${bucket}/${normalizedKey}`;
}

function getSupabaseStorageBucketObjectUrl() {
  return `${getSupabaseStorageBaseUrl()}/object/${encodeURIComponent(
    getSupabaseStorageBucket(),
  )}`;
}

function getSupabaseStorageHeaders() {
  const serviceRoleKey = normalizeAttachmentStorageEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function getSupabaseStorageBaseUrl() {
  const supabaseUrl = getFirstAttachmentStorageEnvValue(process.env, [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required.");
  }

  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
}

function getSupabaseStorageBucket() {
  const bucket = normalizeAttachmentStorageEnvValue(
    process.env.SUPABASE_STORAGE_BUCKET,
    "SUPABASE_STORAGE_BUCKET",
  );

  if (!bucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET is required.");
  }

  return bucket;
}

async function getSupabaseStorageErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");

  return `Supabase Storage request failed: ${response.status} ${text}`;
}

function normalizeStorageKeyPrefix(prefix: string) {
  if (!prefix) {
    return "";
  }

  const normalized = prefix.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!/^[a-zA-Z0-9/_-]+\/$/.test(normalized)) {
    throw new Error("Invalid attachment storage key prefix");
  }

  return normalized;
}

function bufferToReadableStream(buffer: Buffer) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
}

function resolveAttachmentPath(storageKey: string) {
  const root = path.resolve(uploadRoot);
  const filePath = path.resolve(root, storageKey);
  const relativePath = path.relative(root, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid attachment storage key");
  }

  return filePath;
}

export async function getSignedUploadUrlForAttachment(
  originalName: string,
  mimeType: string,
  options: { storageKeyPrefix?: string } = {},
) {
  const storageConfig = getAttachmentStorageConfig(process.env);
  if (!storageConfig.ok || storageConfig.provider !== supabaseStorageAttachmentStorageProvider) {
    return null;
  }

  const extension = path.extname(originalName).toLowerCase();
  const storageKey = createStorageKey(
    extension,
    supabaseStorageAttachmentStorageProvider,
    options.storageKeyPrefix,
  );

  const baseUrl = getSupabaseStorageBaseUrl();
  const bucket = getSupabaseStorageBucket();
  
  const signUrl = `${baseUrl}/object/upload/sign/${encodeURIComponent(bucket)}/${encodeURIComponent(storageKey)}`;
  
  const response = await fetch(signUrl, {
    method: "POST",
    headers: {
      ...getSupabaseStorageHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 900 }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate signed upload URL from Supabase: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as { url: string };
  const uploadUrl = `${baseUrl}${data.url}`;

  return {
    provider: "supabase-storage" as const,
    uploadUrl,
    storageKey,
  };
}
