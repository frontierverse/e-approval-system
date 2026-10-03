import { getMobileChatResponse } from "@/lib/mobile-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export function PUT(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  return getMobileChatResponse(request, "part", context.params);
}
