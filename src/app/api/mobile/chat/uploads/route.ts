import { getMobileChatResponse } from "@/lib/mobile-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export function GET(request: Request) {
  return getMobileChatResponse(request, "uploads");
}

export function POST(request: Request) {
  return getMobileChatResponse(request, "uploads");
}
