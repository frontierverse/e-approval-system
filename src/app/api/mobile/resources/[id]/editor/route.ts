import { mobileResourceResponse } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return mobileResourceResponse(request, "editor", async () => (await context.params).id); }
