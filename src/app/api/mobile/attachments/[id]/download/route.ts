import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { readApprovalAttachmentFile } from "@/lib/approval-attachment-file";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const { id } = await params;
  const attachment = await prisma.attachment.findFirst({
    where: {
      id,
      // Mobile document access is personal, including for administrator accounts.
      document: getReadableDocumentWhere(session.userId, "USER"),
    },
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      size: true,
      document: { select: { status: true } },
    },
  });
  if (!attachment) return mobileJson({ error: "파일을 찾을 수 없습니다." }, 404);

  try {
    // Signed, converted and generated files have their own attachment IDs.
    // This also decrypts storage and marks invalidated automatic approval PDFs.
    const file = await readApprovalAttachmentFile(attachment);
    return new Response(file.body, {
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        "Content-Type": getContentType(file.mimeType, attachment.mimeType),
        "Content-Length": String(file.size ?? attachment.size),
        "Content-Disposition": getContentDisposition(attachment.originalName),
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return mobileJson({ error: "파일을 불러올 수 없습니다." }, 404);
  }
}

function getContentType(...values: Array<string | undefined>) {
  for (const value of values) {
    const type = value?.split(";")[0]?.trim().toLowerCase();
    if (type && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type)) return type;
  }
  return "application/octet-stream";
}

function getContentDisposition(originalName: string) {
  const filename = (originalName.split(/[\\/]/).pop() ?? "")
    .replace(/[\x00-\x1f\x7f]/g, "_").trim() || "attachment";
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
