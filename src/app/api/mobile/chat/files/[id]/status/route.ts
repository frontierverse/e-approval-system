import { getMobileChatResponse } from "@/lib/mobile-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return getMobileChatResponse(request, "status", context.params);
}
