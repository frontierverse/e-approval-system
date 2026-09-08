import { withStaffChatUser } from "@/lib/staff-chat";
import { readStaffChatJson } from "@/lib/staff-chat-core";
import { downloadStaffChatFile } from "@/lib/staff-chat-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withStaffChatUser(async (userId) => downloadStaffChatFile(userId, (await context.params).id, await readStaffChatJson(request)));
}
