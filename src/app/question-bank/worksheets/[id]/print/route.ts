import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { findQuestionWorksheetPdfData } from "@/lib/question-bank";
import { createQuestionWorksheetPdf } from "@/lib/question-bank-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  await requireUser();

  const { id } = await context.params;
  const worksheet = await findQuestionWorksheetPdfData(id);

  if (!worksheet) {
    return new Response("Worksheet not found.", {
      status: 404,
    });
  }

  const pdf = await createQuestionWorksheetPdf(worksheet);

  return createPdfResponse(pdf, createWorksheetPdfFileName(worksheet.title));
}

function createPdfResponse(pdf: Uint8Array, filename: string) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,
      "Content-Type": "application/pdf",
    },
  });
}

function createWorksheetPdfFileName(title: string) {
  const safeTitle =
    title
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "worksheet";

  return `${safeTitle}.pdf`;
}
