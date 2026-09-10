import { withStaffChatUser } from "@/lib/staff-chat";
import { readStaffChatJson } from "@/lib/staff-chat-core";
import { completeStaffChatUpload } from "@/lib/staff-chat-uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withStaffChatUser(async (userId) => {
    await readStaffChatJson(request);
    return { message: await completeStaffChatUpload(userId, (await context.params).id) };
  });
}
