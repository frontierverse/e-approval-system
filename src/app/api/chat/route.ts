import { getStaffChatSummary, withStaffChatUser } from "@/lib/staff-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withStaffChatUser(getStaffChatSummary);
}
