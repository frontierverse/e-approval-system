import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { markAllMobileNotificationsRead } from "@/lib/mobile-notifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getMobileSession(request);
    if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
    return mobileJson(await markAllMobileNotificationsRead(session.userId));
  } catch {
    return mobileJson({ error: "알림을 읽음으로 처리하지 못했습니다. 다시 시도하세요." }, 500);
  }
}
