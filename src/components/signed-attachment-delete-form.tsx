import type { ComponentProps } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { signedAttachmentDeleteReasonMaxLength } from "@/lib/signed-attachment-delete-reason";

type SignedAttachmentDeleteFormProps = {
  action: NonNullable<ComponentProps<"form">["action"]>;
};

export function SignedAttachmentDeleteForm({
  action,
}: SignedAttachmentDeleteFormProps) {
  return (
    <details className="mt-3 rounded-md border border-[#e4b4ad] bg-[#fff8f7] p-3">
      <summary className="cursor-pointer text-sm font-semibold text-[#9f241a]">
        서명본 삭제
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <label className="block text-sm font-semibold text-[#394150]">
          서명본 삭제 사유
          <textarea
            name="deleteReason"
            required
            maxLength={signedAttachmentDeleteReasonMaxLength}
            rows={2}
            placeholder="예: 잘못 날인한 위치라 재생성합니다."
            className="mt-2 block w-full resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm font-normal text-[#16181d] outline-none transition placeholder:text-[#9aa4b2] focus:border-[#9db4d8] focus:ring-2 focus:ring-[#dbe7fb]"
          />
        </label>
        <div className="flex justify-end">
          <ConfirmSubmitButton
            message="입력한 사유로 이 서명본을 삭제하시겠습니까?"
            pendingLabel="삭제 중"
            type="submit"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.dangerOutline,
              "h-9 px-3 text-sm",
            )}
          >
            삭제
          </ConfirmSubmitButton>
        </div>
      </form>
    </details>
  );
}
