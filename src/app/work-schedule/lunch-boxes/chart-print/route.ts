import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  createLunchBoxChartPdf,
  type LunchBoxChartPdfKind,
  type LunchBoxChartPdfOrientation,
} from "@/lib/lunch-box-chart-pdf";
import { getLunchBoxChartData } from "@/lib/lunch-box-counts";
import { createLunchBoxHiredWorkerPdf } from "@/lib/lunch-box-hired-worker-pdf";
import { getLunchBoxOperationsChartData } from "@/lib/lunch-box-operations";

type LunchBoxPrintableChart = LunchBoxChartPdfKind | "operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireUser();

  const chart = getChartKind(request.nextUrl.searchParams.get("chart"));

  if (!chart) {
    return new Response("인쇄할 도시락 차트를 다시 선택하세요.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const orientation = getChartOrientation(
    request.nextUrl.searchParams.get("orientation"),
  );
  const generatedAt = new Date();

  if (chart === "operations") {
    const data = await getLunchBoxOperationsChartData();
    const pdf = await createLunchBoxHiredWorkerPdf({
      data,
      generatedAt,
      orientation,
    });
    const range =
      data.startDate && data.endDate
        ? `${data.startDate}-to-${data.endDate}`
        : "empty";

    return createPdfResponse(
      pdf,
      `lunch-box-hired-workers-${range}-${orientation}.pdf`,
    );
  }

  const includePreservation =
    request.nextUrl.searchParams.get("preservation") !== "exclude";
  const data = await getLunchBoxChartData();
  const pdf = await createLunchBoxChartPdf({
    chart,
    data,
    generatedAt,
    includePreservation,
    orientation,
  });
  const range =
    data.startDate && data.endDate
      ? `${data.startDate}-to-${data.endDate}`
      : "empty";
  const preservation = includePreservation ? "include" : "exclude";

  return createPdfResponse(
    pdf,
    `lunch-box-chart-${chart}-${range}-${preservation}-${orientation}.pdf`,
  );
}

function createPdfResponse(pdf: Uint8Array, fileName: string) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
      "Content-Type": "application/pdf",
    },
  });
}

function getChartKind(value: string | null): LunchBoxPrintableChart | null {
  return value === "total" ||
    value === "schools" ||
    value === "operations"
    ? value
    : null;
}

function getChartOrientation(
  value: string | null,
): LunchBoxChartPdfOrientation {
  return value === "landscape" ? "landscape" : "portrait";
}
