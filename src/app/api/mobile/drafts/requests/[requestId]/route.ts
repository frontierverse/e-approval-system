import { mobileDraftRoute, getMobileDraftRequestStatus } from "@/lib/mobile-drafts";
import { mobileDraftStatusScope } from "@/lib/mobile-draft-core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  return mobileDraftRoute(request, async userId => {
    const { requestId } = await context.params;
    return getMobileDraftRequestStatus(userId, requestId, mobileDraftStatusScope(new URL(request.url)));
  });
}
