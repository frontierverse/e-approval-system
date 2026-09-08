import { markStaffChatRead, withStaffChatUser } from "@/lib/staff-chat";
import { readStaffChatJson } from "@/lib/staff-chat-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return withStaffChatUser(async (userId) => {
    await markStaffChatRead(userId, await readStaffChatJson(request));
    return { ok: true };
  });
}
