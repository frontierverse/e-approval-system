import { withStaffChatUser } from "@/lib/staff-chat";
import { previewStaffChatFile } from "@/lib/staff-chat-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET previews are read-only: rendering, prefetching or opening one cannot
// acquire a download lease, mark a message read or consume its stored file.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withStaffChatUser(async (userId) => previewStaffChatFile(userId, (await context.params).id));
}
