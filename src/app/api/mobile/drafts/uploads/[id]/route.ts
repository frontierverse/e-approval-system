import { mobileDraftRoute, deleteMobileUpload } from "@/lib/mobile-drafts";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return mobileDraftRoute(request, async userId => deleteMobileUpload(userId, (await params).id)); }
