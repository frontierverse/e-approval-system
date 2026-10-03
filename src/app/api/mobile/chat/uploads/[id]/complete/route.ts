import { getMobileChatResponse } from "@/lib/mobile-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return getMobileChatResponse(request, "publish", context.params);
}
