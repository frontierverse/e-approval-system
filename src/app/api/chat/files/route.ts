import { withStaffChatUser } from "@/lib/staff-chat";
import { readStaffChatFileForm } from "@/lib/staff-chat-file-core";
import { getStaffChatFilePolicy, sendStaffChatFile } from "@/lib/staff-chat-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withStaffChatUser(() => getStaffChatFilePolicy());
}

export async function POST(request: Request) {
  return withStaffChatUser(async (userId) => ({ message: await sendStaffChatFile(userId, await readStaffChatFileForm(request)) }));
}
