"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

export type ProxyApprovalFormResult = { error: string } | void;

export function ProxyApprovalForm({ action, stepId, reject = false, label, confirmation }: {
  action: (formData: FormData) => Promise<ProxyApprovalFormResult>;
  stepId: string;
  reject?: boolean;
  label: string;
  confirmation: string;
}) {
  const [comment, setComment] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [state, formAction, pending] = useActionState(async (_: ProxyApprovalFormResult, data: FormData) => action(data), undefined);
  useEffect(() => {
    if (!state?.error || pending) return;
    // React completes the form reset after the action; focus after that commit.
    const frame = requestAnimationFrame(() => errorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [state, pending]);
  const inputId = `${reject ? "proxy-reject" : "proxy-approve"}-${stepId}`;
  return (
    <form action={formAction} className="mt-3 grid gap-2">
      <label htmlFor={inputId} className="text-xs font-medium text-[#394150]">
        {reject ? "대리결재 반려 사유" : "대리결재 사유"}
      </label>
      <input id={inputId} name="comment" required minLength={2} maxLength={1000}
        value={comment} onChange={(event) => setComment(event.target.value)} disabled={pending}
        aria-describedby={state?.error ? `${inputId}-error` : undefined}
        className="min-h-11 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#b8d9d7]" />
      {state?.error ? <p ref={errorRef} id={`${inputId}-error`} role="alert" tabIndex={-1}
        className="text-sm text-[#8a1f1f]">{state.error}</p> : null}
      <div className="flex justify-end">
        <ConfirmSubmitButton type="submit" message={confirmation} disabled={pending}
          pendingLabel={reject ? "반려 처리 중" : "대리결재 처리 중"}
          className={buttonClass(buttonStyles.base, reject ? buttonStyles.dangerOutline : buttonStyles.approve, "min-h-11 px-3 text-sm")}>
          {label}
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}
