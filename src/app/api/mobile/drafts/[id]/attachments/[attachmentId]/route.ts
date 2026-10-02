import { mobileDraftRoute, deleteMobileDraftAttachment } from "@/lib/mobile-drafts";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) { return mobileDraftRoute(request, async userId => { const p = await params; return deleteMobileDraftAttachment(userId, p.id, p.attachmentId); }); }
