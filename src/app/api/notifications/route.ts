import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getNotificationSummary } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json(await getNotificationSummary(user.id));
}
