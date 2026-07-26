import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLunchBoxCountGrid } from "@/lib/lunch-box-counts";
import {
  getLunchBoxCalendarWeekDates,
  hasLunchBoxStatusData,
  isLunchBoxDate,
} from "@/lib/lunch-box-counts-core";
import {
  createLunchBoxStatusPdf,
  createLunchBoxWeeklyStatusPdf,
} from "@/lib/lunch-box-status-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireUser();

  const date = request.nextUrl.searchParams.get("date");
  const period = request.nextUrl.searchParams.get("period");

  if (
    !date ||
    !isLunchBoxDate(date) ||
    (period !== null && period !== "week")
  ) {
    return new Response("현황표를 인쇄할 날짜를 다시 선택하세요.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const generatedAt = new Date();

  if (period === "week") {
    const grids = (
      await Promise.all(
        getLunchBoxCalendarWeekDates(date).map((weekDate) =>
          getLunchBoxCountGrid({ date: weekDate }),
        ),
      )
    ).filter(hasLunchBoxStatusData);

    if (grids.length === 0) {
      return new Response(
        "해당 주에 인쇄할 도시락 공급 현황이 없습니다.",
        {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }

    const pdf = await createLunchBoxWeeklyStatusPdf({ generatedAt, grids });
    const firstDate = grids[0].date;
    const lastDate = grids[grids.length - 1].date;

    return createPdfResponse(
      pdf,
      `lunch-box-status-${firstDate}-to-${lastDate}.pdf`,
    );
  }

  const grid = await getLunchBoxCountGrid({ date });
  const pdf = await createLunchBoxStatusPdf({ generatedAt, grid });

  return createPdfResponse(pdf, `lunch-box-status-${date}.pdf`);
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
