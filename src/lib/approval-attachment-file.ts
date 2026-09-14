import { readStoredAttachmentFile } from "@/lib/attachment-storage";
import { isInvalidAutomaticApprovalPdf } from "@/lib/approval-pdf-invalidation";
import { markInvalidApprovalPdf } from "@/lib/generated-approval-pdf";
import { prisma } from "@/lib/prisma";

export async function readApprovalAttachmentFile(attachment: {
  id: string; originalName: string; storageProvider: string; storageKey: string;
  document: { status: string };
}) {
  const stored = await readStoredAttachmentFile(attachment);
  if (!await isInvalidAutomaticApprovalPdf(prisma, attachment)) return stored;
  const source = Buffer.from(await new Response(stored.body).arrayBuffer());
  const marked = await markInvalidApprovalPdf(source);
  return {
    body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(marked)); controller.close(); } }),
    size: marked.length,
    mimeType: "application/pdf",
  };
}
