import { requireUser } from "@/lib/auth";
import { getYouthCommonSchedules } from "@/lib/youth-common-schedules";
import { createYouthCommonSchedulePdf } from "@/lib/youth-schedule-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await requireUser();

  const schedules = await getYouthCommonSchedules();
  const pdf = await createYouthCommonSchedulePdf({ schedules });

  return createPdfResponse(pdf, "youth-common-schedule.pdf");
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
