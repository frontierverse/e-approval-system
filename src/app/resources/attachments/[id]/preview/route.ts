import { getCurrentUser } from "@/lib/auth";
import { readResourceAttachment, resourceFailure, resourceJson } from "@/lib/mobile-resources";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return resourceJson({ error: "인증이 필요합니다.", code: "UNAUTHORIZED" }, 401);
    const { id } = await context.params;
    return await readResourceAttachment({ actorId: user.id }, id, { preview: true, signal: request.signal });
  } catch (error) { return resourceFailure(error); }
}
