import { withStaffChatUser } from "@/lib/staff-chat";
import { StaffChatError } from "@/lib/staff-chat-core";
import { readStaffChatChunk } from "@/lib/staff-chat-upload-core";
import { putStaffChatUploadPart } from "@/lib/staff-chat-uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export async function PUT(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  return withStaffChatUser(async (userId) => {
    const { id, index } = await context.params;
    if (!/^(?:0|[1-9]\d?)$/.test(index)) throw new StaffChatError("파일 전송 순서가 올바르지 않습니다.");
    return putStaffChatUploadPart(userId, id, Number(index), await readStaffChatChunk(request));
  });
}
