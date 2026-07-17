import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createLunchBoxCountPdf } from "@/lib/lunch-box-count-pdf";
import { getLunchBoxCountGrid } from "@/lib/lunch-box-counts";
import { isLunchBoxDate } from "@/lib/lunch-box-counts-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireUser();

  const date = request.nextUrl.searchParams.get("date");

  if (!date || !isLunchBoxDate(date)) {
    return new Response("인쇄할 날짜를 다시 선택하세요.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const generatedAt = new Date();
  const grid = await getLunchBoxCountGrid({ date });
  const pdf = await createLunchBoxCountPdf({ generatedAt, grid });

  return createPdfResponse(pdf, `lunch-box-counts-${date}.pdf`);
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
