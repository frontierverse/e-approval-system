export const signedAttachmentDeleteReasonMaxLength = 200;

export function parseSignedAttachmentDeleteReason(
  value: FormDataEntryValue | null,
):
  | { ok: true; reason: string }
  | { ok: false; message: string } {
  const reason =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  if (!reason) {
    return {
      ok: false,
      message: "서명본 삭제 사유를 입력하세요.",
    };
  }

  if (reason.length > signedAttachmentDeleteReasonMaxLength) {
    return {
      ok: false,
      message: `서명본 삭제 사유는 ${signedAttachmentDeleteReasonMaxLength}자 이내로 입력하세요.`,
    };
  }

  return {
    ok: true,
    reason,
  };
}
