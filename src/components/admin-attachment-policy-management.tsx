"use client";

import { useActionState } from "react";
import {
  type AdminAttachmentPolicyFormState,
  updateAdminAttachmentPolicyAction,
} from "@/app/admin/actions";
import {
  FormMessage,
  TextareaField,
  TextField,
} from "@/components/admin-form-controls";
import { maxAttachmentPolicyTotalSizeMb } from "@/lib/attachment-limits";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type AdminAttachmentPolicyManagementProps = {
  policy: {
    maxFileCount: number;
    maxFileSizeMb: number;
    allowedExtensions: string[];
  };
};

const initialState: AdminAttachmentPolicyFormState = {};

export function AdminAttachmentPolicyManagement({
  policy,
}: AdminAttachmentPolicyManagementProps) {
  const [state, formAction, pending] = useActionState(
    updateAdminAttachmentPolicyAction,
    initialState,
  );
  const allowedExtensions =
    state.values?.allowedExtensions ?? policy.allowedExtensions.join(", ");

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eef1f5] pb-4">
        <div>
          <h2 className="text-base font-semibold">첨부파일 정책</h2>
          <p className="mt-1 text-sm text-[#697386]">
            기안작성에서 업로드할 수 있는 파일 개수, 크기, 확장자를 관리합니다.
          </p>
        </div>
        <span className="rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 py-1.5 text-sm font-semibold text-[#394150]">
          파일당 {policy.maxFileSizeMb}MB
        </span>
      </div>

      <form
        action={formAction}
        className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2"
      >
        <TextField
          label="최대 파일 개수"
          name="maxFileCount"
          type="number"
          min={1}
          max={20}
          defaultValue={state.values?.maxFileCount ?? policy.maxFileCount}
        />
        <TextField
          label="파일당 최대 크기(MB)"
          name="maxFileSizeMb"
          type="number"
          min={1}
          max={maxAttachmentPolicyTotalSizeMb}
          defaultValue={state.values?.maxFileSizeMb ?? policy.maxFileSizeMb}
        />
        <TextareaField
          label="허용 확장자"
          name="allowedExtensions"
          rows={2}
          defaultValue={allowedExtensions}
          placeholder=".pdf, .png, .docx"
        />

        <div className="flex min-w-0 items-end sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 w-full min-w-0 px-4 text-sm",
            )}
          >
            {pending ? "저장 중" : "저장"}
          </button>
        </div>
      </form>

      <FormMessage state={state} />
      <p className="mt-3 text-xs leading-5 text-[#697386]">
        안정적인 업로드를 위해 파일 개수 x 파일당 크기는 총{" "}
        {maxAttachmentPolicyTotalSizeMb}MB 이하로 설정됩니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {policy.allowedExtensions.map((extension) => (
          <span
            key={extension}
            className="rounded-md border border-[#d9dee7] bg-[#fbfcfd] px-2.5 py-1 text-xs font-semibold text-[#394150]"
          >
            {extension}
          </span>
        ))}
      </div>
    </section>
  );
}
