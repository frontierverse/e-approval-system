import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getAttachmentStorageConfig,
  getAttachmentStorageKeyPrefix,
  localAttachmentStorageProvider,
  resolveAttachmentStorageProvider,
  supabaseStorageAttachmentStorageProvider,
  vercelBlobAttachmentStorageProvider,
} from "../src/lib/attachment-storage-core.ts";

describe("attachment storage config", () => {
  test("defaults to local storage when no driver is configured", () => {
    assert.equal(resolveAttachmentStorageProvider(undefined), "local");
    assert.deepEqual(getAttachmentStorageConfig({}), {
      ok: true,
      provider: localAttachmentStorageProvider,
    });
  });

  test("requires a Blob token when Vercel Blob is enabled", () => {
    assert.deepEqual(getAttachmentStorageConfig({
      ATTACHMENT_STORAGE_DRIVER: "vercel-blob",
    }), {
      ok: false,
      provider: vercelBlobAttachmentStorageProvider,
      message:
        "BLOB_READ_WRITE_TOKEN is required when ATTACHMENT_STORAGE_DRIVER is vercel-blob.",
    });
  });

  test("requires Supabase Storage server credentials when enabled", () => {
    assert.deepEqual(getAttachmentStorageConfig({
      ATTACHMENT_STORAGE_DRIVER: "supabase-storage",
    }), {
      ok: false,
      provider: supabaseStorageAttachmentStorageProvider,
      message:
        "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required when ATTACHMENT_STORAGE_DRIVER is supabase-storage.",
    });

    assert.deepEqual(getAttachmentStorageConfig({
      ATTACHMENT_STORAGE_DRIVER: "supabase-storage",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      SUPABASE_STORAGE_BUCKET: "approval-attachments",
    }), {
      ok: true,
      provider: supabaseStorageAttachmentStorageProvider,
    });
  });

  test("uses an attachments prefix for Vercel Blob keys", () => {
    assert.equal(
      getAttachmentStorageKeyPrefix(vercelBlobAttachmentStorageProvider),
      "attachments/",
    );
  });

  test("uses an attachments prefix for Supabase Storage keys", () => {
    assert.equal(
      getAttachmentStorageKeyPrefix(supabaseStorageAttachmentStorageProvider),
      "attachments/",
    );
  });
});
