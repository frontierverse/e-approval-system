import { mobileDraftRoute, createMobileUpload, mobileDraftBody } from "@/lib/mobile-drafts";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) { return mobileDraftRoute(request, async userId => createMobileUpload(userId, await mobileDraftBody(request))); }
