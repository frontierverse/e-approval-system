"use client";

import { useActionState, useState } from "react";
import type { FormEvent } from "react";
import type { ApprovalDecisionState } from "@/app/documents/[id]/actions";
import { PendingOverlay } from "@/components/form-pending-overlay";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type ApprovalDecisionFormProps = {
  action: (
    state: ApprovalDecisionState,
    formData: FormData,
  ) => Promise<ApprovalDecisionState>;
};

const initialState: ApprovalDecisionState = {};
type ApprovalDecision = "approve" | "reject";

export function ApprovalDecisionForm({ action }: ApprovalDecisionFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [pendingDecision, setPendingDecision] =
    useState<ApprovalDecision | null>(null);
  const pendingLabel =
    pendingDecision === "reject" ? "반려 처리 중" : "문서 승인 중";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;

    if (!(submitter instanceof HTMLButtonElement)) {
      return;
    }

    const message =
      submitter.value === "approve"
        ? "이 문서를 승인하시겠습니까?"
        : submitter.value === "reject"
          ? "이 문서를 반려하시겠습니까?"
          : "";

    if (message && !window.confirm(message)) {
      event.preventDefault();
      setPendingDecision(null);
      return;
    }

    if (submitter.value === "approve" || submitter.value === "reject") {
      setPendingDecision(submitter.value);
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <h2 className="text-base font-semibold">결재 처리</h2>
      <label
        htmlFor="approvalComment"
        className="mt-4 block text-xs font-semibold text-[#697386]"
      >
        의견
      </label>
      <textarea
        id="approvalComment"
        name="comment"
        rows={4}
        defaultValue={state.values?.comment ?? ""}
        placeholder="승인 의견 또는 반려 사유를 입력하세요"
        className="mt-2 w-full resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
      />
      {state.error ? (
        <p className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {state.error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.danger,
            "h-10 px-4 text-sm",
          )}
        >
          반려
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.approve,
            "h-10 px-4 text-sm",
          )}
        >
          승인
        </button>
      </div>
      <PendingOverlay label={pendingLabel} show={pending} />
    </form>
  );
}
