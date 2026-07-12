import { UserRole } from "@/generated/prisma/client";
import { readStoredAttachmentFile } from "@/lib/attachment-storage";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Temporary admin-only check that the app can read youth decision documents
// back through the decryption path. It reads + decrypts each file and reports
// whether the bytes look like a real (decrypted) file of the expected size.
//
// It deliberately does NOT serve the file and does NOT write a download audit
// log, so running it leaves no footprint. Delete this route once verified.
//
// Trigger: open /admin/youth-decision-documents/verify while logged in as admin.
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("인증이 필요합니다.", { status: 401 });
  }

  if (user.role !== UserRole.ADMIN) {
    return new Response("권한이 없습니다.", { status: 403 });
  }

  const documents = await prisma.youthDecisionDocument.findMany({
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      size: true,
    },
  });

  let okCount = 0;
  let failedCount = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const document of documents) {
    try {
      const stored = await readStoredAttachmentFile({
        storageKey: document.storageKey,
        storageProvider: document.storageProvider,
      });
      const buffer = Buffer.from(await new Response(stored.body).arrayBuffer());
      const header = buffer.subarray(0, 8);
      const looksStillEncrypted =
        header.subarray(0, 4).toString("ascii") === "ENC1";
      const sizeMatches = buffer.byteLength === document.size;
      const ok = !looksStillEncrypted && sizeMatches;

      if (ok) {
        okCount += 1;
      } else {
        failedCount += 1;
      }

      results.push({
        originalName: document.originalName,
        mimeType: document.mimeType,
        ok,
        looksStillEncrypted,
        sizeMatches,
        decryptedSize: buffer.byteLength,
        expectedSize: document.size,
        // First bytes so a human can eyeball the real file signature
        // (e.g. "%PDF-1.7", "PNG", "PK" for docx/hwpx).
        header: header.toString("latin1").replace(/[^\x20-\x7e]/g, "."),
      });
    } catch (error) {
      failedCount += 1;
      results.push({
        originalName: document.originalName,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    ok: failedCount === 0,
    summary: { total: documents.length, ok: okCount, failed: failedCount },
    results,
  });
}
