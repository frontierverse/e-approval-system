import { mobileDraftRoute, getMobileDraft, saveMobileDraft, mobileDraftBody } from "@/lib/mobile-drafts";
import { deleteMobileDraft } from "@/lib/mobile-draft-delete";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { return mobileDraftRoute(request, async userId => getMobileDraft(userId, (await params).id)); }
export async function POST(request: Request, { params }: Context) { return mobileDraftRoute(request, async userId => saveMobileDraft(userId, await mobileDraftBody(request), (await params).id)); }
export async function DELETE(request: Request, { params }: Context) { return mobileDraftRoute(request, async userId => deleteMobileDraft(userId, (await params).id, await mobileDraftBody(request))); }
