import { mobileDraftRoute, getMobileDraftList, saveMobileDraft, mobileDraftBody } from "@/lib/mobile-drafts";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) { return mobileDraftRoute(request, getMobileDraftList); }
export async function POST(request: Request) { return mobileDraftRoute(request, async userId => saveMobileDraft(userId, await mobileDraftBody(request))); }
