import { getStaffChatMessages, sendStaffChatMessage, withStaffChatUser } from "@/lib/staff-chat";
import { readStaffChatJson } from "@/lib/staff-chat-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  return withStaffChatUser((userId) => getStaffChatMessages(userId, search.get("peerId"), search.get("before")));
}

export async function POST(request: Request) {
  return withStaffChatUser(async (userId) => ({ message: await sendStaffChatMessage(userId, await readStaffChatJson(request)) }));
}
