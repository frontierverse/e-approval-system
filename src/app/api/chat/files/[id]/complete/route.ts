import { withStaffChatUser } from "@/lib/staff-chat";
import { readStaffChatJson } from "@/lib/staff-chat-core";
import { completeStaffChatFileDownload } from "@/lib/staff-chat-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withStaffChatUser(async (userId) => ({ message: await completeStaffChatFileDownload(userId, (await context.params).id, await readStaffChatJson(request)) }));
}
