import { mobileDraftRoute, getMobileDraftOptions } from "@/lib/mobile-drafts";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) { return mobileDraftRoute(request, getMobileDraftOptions); }
