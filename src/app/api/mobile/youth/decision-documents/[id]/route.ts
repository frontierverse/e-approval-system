import { mobileYouthDecisionResponse } from "@/lib/mobile-youth-decision-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return mobileYouthDecisionResponse(request, "delete", async () => (await params).id); }
