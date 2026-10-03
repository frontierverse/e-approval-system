import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { parseMobileNotificationFilters } from "@/lib/mobile-notifications-core";
import { getMobileNotificationPage } from "@/lib/mobile-notifications";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getMobileSession(request);
    if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
    const parsed = parseMobileNotificationFilters(new URL(request.url).searchParams);
    if (!parsed.ok) return mobileJson({ error: parsed.error }, 400);
    return mobileJson(await getMobileNotificationPage(session.userId, parsed.filters));
  } catch {
    return mobileJson({ error: "알림을 불러오지 못했습니다. 다시 시도하세요." }, 500);
  }
}
