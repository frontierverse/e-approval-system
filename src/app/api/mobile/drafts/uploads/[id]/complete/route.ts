import { mobileDraftRoute, completeMobileUpload } from "@/lib/mobile-drafts";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return mobileDraftRoute(request, async userId => completeMobileUpload(userId, (await params).id)); }
