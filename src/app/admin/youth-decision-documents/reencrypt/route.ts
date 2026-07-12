import { UserRole } from "@/generated/prisma/client";
import { isAttachmentEncryptionEnabled } from "@/lib/attachment-encryption-core";
import { encryptStoredAttachmentInPlace } from "@/lib/attachment-storage";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// One-time, admin-only migration: encrypts youth decision documents that were
// uploaded before ATTACHMENT_ENCRYPTION_KEY was enabled. Idempotent — files
// already encrypted are detected and skipped, so it is safe to re-run.
//
// Trigger while logged in as an admin (same-origin, sends the session cookie):
//   fetch("/admin/youth-decision-documents/reencrypt", { method: "POST" })
//     .then((r) => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("인증이 필요합니다.", { status: 401 });
  }

  if (user.role !== UserRole.ADMIN) {
    return new Response("권한이 없습니다.", { status: 403 });
  }

  if (!isAttachmentEncryptionEnabled()) {
    return Response.json(
      {
        ok: false,
        message:
          "ATTACHMENT_ENCRYPTION_KEY가 설정되어 있지 않아 재암호화를 진행할 수 없습니다.",
      },
      { status: 400 },
    );
  }

  const documents = await prisma.youthDecisionDocument.findMany({
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
    },
  });

  const summary = {
    total: documents.length,
    encrypted: 0,
    alreadyEncrypted: 0,
    failed: 0,
  };
  const failures: Array<{ id: string; originalName: string; error: string }> =
    [];

  for (const document of documents) {
    try {
      const result = await encryptStoredAttachmentInPlace(
        {
          storageKey: document.storageKey,
          storageProvider: document.storageProvider,
        },
        document.mimeType,
      );

      if (result === "encrypted") {
        summary.encrypted += 1;
      } else if (result === "already-encrypted") {
        summary.alreadyEncrypted += 1;
      } else {
        summary.failed += 1;
        failures.push({
          id: document.id,
          originalName: document.originalName,
          error: "encryption disabled",
        });
      }
    } catch (error) {
      summary.failed += 1;
      failures.push({
        id: document.id,
        originalName: document.originalName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.info("Youth decision document re-encryption complete", summary);

  return Response.json({ ok: summary.failed === 0, summary, failures });
}
