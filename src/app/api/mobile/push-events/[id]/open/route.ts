import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { pushEventId } from "@/lib/mobile-push-events-core";
import { openStaffPushEvent } from "@/lib/mobile-push-events";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getMobileSession(request);
    if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
    const { id } = await context.params;
    if (!pushEventId(id)) return mobileJson({ error: "알림 정보가 올바르지 않습니다." }, 400);
    const href = await openStaffPushEvent(session.user, id);
    return href ? mobileJson({ ok: true, href }) : mobileJson({ error: "현재 열 수 없는 알림입니다. 업무 목록에서 최신 상태를 확인하세요." }, 404);
  } catch { return mobileJson({ error: "알림을 열지 못했습니다. 다시 시도하세요." }, 500); }
}
