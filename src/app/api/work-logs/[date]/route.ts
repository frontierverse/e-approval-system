import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSafeErrorDigest, logServerEvent } from "@/lib/observability";
import { getWorkLogToday, isWorkLogDate } from "@/lib/work-log-core";
import { getWorkLogLinkedScheduleLoadState } from "@/lib/work-log-linked-schedules";
import { getWorkLogEntry } from "@/lib/work-logs";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "인증이 필요합니다." },
      { headers: noStoreHeaders, status: 401 },
    );
  }

  const { date } = await params;

  if (!isWorkLogDate(date) || date > getWorkLogToday()) {
    return NextResponse.json(
      { error: "업무일지 날짜가 올바르지 않습니다." },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  try {
    const [entry, linkedScheduleState] = await Promise.all([
      getWorkLogEntry({
        authorId: user.id,
        workDate: date,
      }),
      getWorkLogLinkedScheduleLoadState(date),
    ]);

    if (!entry) {
      return NextResponse.json(
        { error: "업무일지를 찾을 수 없습니다." },
        { headers: noStoreHeaders, status: 404 },
      );
    }

    return NextResponse.json(
      { entry, linkedScheduleState },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    logServerEvent("error", "work_log.load_failed", {
      errorDigest: getSafeErrorDigest(error),
      workDate: date,
    });

    return NextResponse.json(
      { error: "업무일지와 완료한 할 일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { headers: noStoreHeaders, status: 503 },
    );
  }
}
