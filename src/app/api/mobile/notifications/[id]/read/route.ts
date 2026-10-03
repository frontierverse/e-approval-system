import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { validMobileNotificationId } from "@/lib/mobile-notifications-core";
import { markMobileNotificationRead } from "@/lib/mobile-notifications";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getMobileSession(request);
    if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
    const { id } = await params;
    if (!validMobileNotificationId(id)) return mobileJson({ error: "알림이 올바르지 않습니다." }, 400);
    const result = await markMobileNotificationRead(session.userId, id);
    return result ? mobileJson(result) : mobileJson({ error: "알림을 찾을 수 없습니다." }, 404);
  } catch {
    return mobileJson({ error: "알림을 읽음으로 처리하지 못했습니다. 다시 시도하세요." }, 500);
  }
}
