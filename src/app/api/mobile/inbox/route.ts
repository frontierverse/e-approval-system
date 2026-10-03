import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { isApprovalAuthorityPosition } from "@/lib/approval-authority";
import { parseMobileInboxFilters } from "@/lib/mobile-inbox-core";
import { getMobileInboxPage } from "@/lib/mobile-inbox";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  if (!isApprovalAuthorityPosition(session.user.position.name)) {
    return mobileJson({ error: "받은결재는 시설장만 사용할 수 있습니다." }, 403);
  }
  const parsed = parseMobileInboxFilters(new URL(request.url).searchParams);
  if (!parsed.ok) return mobileJson({ error: parsed.error }, 400);
  return mobileJson(await getMobileInboxPage(session.userId, parsed.filters));
}
