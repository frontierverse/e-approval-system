import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  createLunchBoxDailySchoolListPdf,
  type LunchBoxDailySchoolListPdfOrientation,
} from "@/lib/lunch-box-daily-school-list-pdf";
import { getLunchBoxDailySchoolChecklist } from "@/lib/lunch-box-counts";
import { isLunchBoxDate } from "@/lib/lunch-box-counts-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireUser();

  const date = request.nextUrl.searchParams.get("date");

  if (!date || !isLunchBoxDate(date)) {
    return new Response("날짜별 학교 목록을 인쇄할 날짜를 다시 선택하세요.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const checklist = await getLunchBoxDailySchoolChecklist({ date });
  const orientation = getDailySchoolPdfOrientation(
    request.nextUrl.searchParams.get("orientation"),
  );
  const pdf = await createLunchBoxDailySchoolListPdf({
    checklist,
    generatedAt: new Date(),
    orientation,
  });
  const orientationSuffix =
    orientation === "portrait" ? "-portrait" : "";

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        `lunch-box-daily-school-list-${date}${orientationSuffix}.pdf`,
      )}`,
      "Content-Type": "application/pdf",
    },
  });
}

function getDailySchoolPdfOrientation(
  value: string | null,
): LunchBoxDailySchoolListPdfOrientation {
  return value === "portrait" ? "portrait" : "landscape";
}
