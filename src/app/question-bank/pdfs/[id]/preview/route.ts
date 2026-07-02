import { getCurrentUser } from "@/lib/auth";
import { readStoredAttachmentFile } from "@/lib/attachment-storage";
import { findQuestionBankPdfFile } from "@/lib/question-bank";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return new Response("인증이 필요합니다.", { status: 401 });
  }

  const pdf = await findQuestionBankPdfFile(id);

  if (!pdf) {
    return new Response("PDF를 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const storedFile = await readStoredAttachmentFile({
      storageProvider: pdf.storageProvider,
      storageKey: pdf.storageKey,
    });

    return new Response(storedFile.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Length": String(storedFile.size ?? pdf.size),
        "Content-Disposition": getContentDisposition(pdf.originalName),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("PDF를 찾을 수 없습니다.", { status: 404 });
  }
}

function getContentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);

  return `inline; filename="${fallback || "worksheet.pdf"}"; filename*=UTF-8''${encoded}`;
}
