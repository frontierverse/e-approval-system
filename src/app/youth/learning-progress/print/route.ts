import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getYouthLearningSchedules } from "@/lib/youth-learning-schedules";
import { getYouthProfiles } from "@/lib/youth-management";
import {
  getYouthLearningScheduleToday,
  isYouthLearningScheduleDate,
} from "@/lib/youth-management-core";
import { createYouthLearningProgressPdf } from "@/lib/youth-schedule-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireUser();

  const selectedDate = getSelectedDate(request.nextUrl.searchParams.get("date"));
  const [youths, schedules] = await Promise.all([
    getYouthProfiles(),
    getYouthLearningSchedules(selectedDate),
  ]);
  const pdf = await createYouthLearningProgressPdf({
    schedules,
    selectedDate,
    youths,
  });

  return createPdfResponse(pdf, `youth-learning-progress-${selectedDate}.pdf`);
}

function getSelectedDate(value: string | null) {
  return value && isYouthLearningScheduleDate(value)
    ? value
    : getYouthLearningScheduleToday();
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
