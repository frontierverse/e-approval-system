import { withStaffChatUser } from "@/lib/staff-chat";
import { readStaffChatJson } from "@/lib/staff-chat-core";
import { startStaffChatUpload } from "@/lib/staff-chat-uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return withStaffChatUser(async (userId) => startStaffChatUpload(userId, await readStaffChatJson(request)));
}
