import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { normalizeWorkScheduleMonth } from "@/lib/work-schedule-calendar";
import { getWorkSchedules } from "@/lib/work-schedules";
import {
  createWorkSchedulePdf,
  type SchedulePdfOrientation,
} from "@/lib/youth-schedule-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireUser();

  const orientation = getSchedulePdfOrientation(
    request.nextUrl.searchParams.get("orientation"),
  );
  const month = normalizeWorkScheduleMonth(
    request.nextUrl.searchParams.get("month") ?? undefined,
  );
  const schedules = await getWorkSchedules(month);
  const pdf = await createWorkSchedulePdf({ orientation, schedules });

  return createPdfResponse(pdf, `work-schedule-${month}-${orientation}.pdf`);
}

function getSchedulePdfOrientation(
  value: string | null,
): SchedulePdfOrientation {
  return value === "landscape" ? "landscape" : "portrait";
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
