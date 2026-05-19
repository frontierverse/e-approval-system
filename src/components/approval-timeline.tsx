import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { UserIdentity } from "@/components/user-identity";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  type ApprovalDocument,
  type ApprovalStep,
  formatDateTime,
} from "@/lib/mock-data";

type ApprovalTimelineProps = {
  document: ApprovalDocument;
  progressLabel: string;
  progressPercent: number;
  currentUserId?: string;
  currentUserRole?: string;
  proxyApproveDocumentAction?: (
    targetStepId: string,
    formData: FormData,
  ) => Promise<void>;
  rejectProxyApprovalAction?: (
    stepId: string,
    formData: FormData,
  ) => Promise<void>;
};

export function ApprovalTimeline({
  document,
  currentUserId,
  currentUserRole,
  progressLabel,
  progressPercent,
  proxyApproveDocumentAction,
  rejectProxyApprovalAction,
}: ApprovalTimelineProps) {
  const rejectedStep = document.approvalSteps.find(
    (step) => step.status === "rejected",
  );

  return (
    <article className="rounded-md border border-[#d9dee7] bg-white p-5">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">결재 진행</h2>
          <div className="w-28 shrink-0">
            <p className="text-right text-xs font-semibold text-[#394150]">
              {progressLabel}
            </p>
            <div className="mt-2 h-2 rounded-full bg-[#edf1f5]">
              <div
                className="h-full rounded-full bg-[#196b69]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
        <p className="mt-1 text-sm text-[#697386]">
          결재 순서와 현재 처리해야 할 단계를 확인합니다.
        </p>
      </div>

      {rejectedStep?.comment ? (
        <div className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-4 py-3">
          <p className="text-sm font-semibold text-[#8a1f1f]">반려 사유</p>
          <p className="mt-2 text-sm leading-6 text-[#394150]">
            {rejectedStep.comment}
          </p>
        </div>
      ) : null}

      {document.approvalSteps.length > 0 ? (
        <ol className="mt-5 space-y-4">
          {document.approvalSteps.map((step, index) => (
            <TimelineStep
              key={step.id}
              document={document}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              proxyApproveDocumentAction={proxyApproveDocumentAction}
              rejectProxyApprovalAction={rejectProxyApprovalAction}
              step={step}
              isLast={index === document.approvalSteps.length - 1}
            />
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm leading-6 text-[#697386]">
          결재 라인이 비어있습니다. 관리자에게 문의하세요.
        </div>
      )}
    </article>
  );
}

function TimelineStep({
  currentUserId,
  currentUserRole,
  document,
  isLast,
  proxyApproveDocumentAction,
  rejectProxyApprovalAction,
  step,
}: {
  currentUserId?: string;
  currentUserRole?: string;
  document: ApprovalDocument;
  isLast: boolean;
  proxyApproveDocumentAction?: (
    targetStepId: string,
    formData: FormData,
  ) => Promise<void>;
  rejectProxyApprovalAction?: (
    stepId: string,
    formData: FormData,
  ) => Promise<void>;
  step: ApprovalStep;
}) {
  const tone = getTimelineTone(step.status);
  const canProxyApprove =
    proxyApproveDocumentAction &&
    canProxyApproveThroughStep(document, step, currentUserId, currentUserRole);
  const canRejectProxyApproval =
    rejectProxyApprovalAction &&
    canRejectProxyStep(document, step, currentUserId, currentUserRole);

  return (
    <li className="relative min-h-20 pl-12">
      {!isLast ? (
        <span
          aria-hidden="true"
          className="absolute left-[1.125rem] top-10 h-[calc(100%-1rem)] w-px bg-[#e7ecf2]"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={[
          "absolute left-0 top-0 grid size-9 place-items-center rounded-full border text-sm font-semibold",
          tone.marker,
        ].join(" ")}
      >
        {step.order}
      </span>

      <div
        className={[
          "rounded-md border px-4 py-3",
          tone.card,
        ].join(" ")}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <UserIdentity
              user={step.approver}
              meta={[step.approver.departmentName, step.approver.positionName]
                .filter(Boolean)
                .join(" / ")}
            />
          </div>
          <StatusBadge type="step" status={step.status} />
        </div>

        <p className="mt-3 text-xs font-medium text-[#697386]">
          {getTimelineDescription(step)}
        </p>

        {canProxyApprove ? (
          <form
            action={proxyApproveDocumentAction.bind(null, step.id)}
            className="mt-3 flex justify-end"
          >
            <ConfirmSubmitButton
              message={`${step.order}차 ${step.approver.name}님까지 대리결재하시겠습니까?`}
              type="submit"
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.approve,
                "h-9 px-3 text-sm",
              )}
            >
              {step.status === "pending"
                ? "현재 단계 대리결재"
                : `${step.order}차까지 대리결재`}
            </ConfirmSubmitButton>
          </form>
        ) : null}

        {step.proxyApprovedBy ? (
          <div className="mt-3 rounded-md border border-[#e5ebd7] bg-[#f8fbf1] px-3 py-2">
            <p className="text-xs font-semibold text-[#4e6c26]">
              대리결재 처리자
            </p>
            <div className="mt-2">
              <UserIdentity
                user={step.proxyApprovedBy}
                meta={[
                  step.proxyApprovedBy.departmentName,
                  step.proxyApprovedBy.positionName,
                ]
                  .filter(Boolean)
                  .join(" / ")}
                size="xs"
              />
            </div>
          </div>
        ) : null}

        {step.comment ? (
          <p className="mt-3 rounded-md bg-[#fbfcfd] px-3 py-2 text-sm leading-6 text-[#394150]">
            {step.comment}
          </p>
        ) : null}

        {canRejectProxyApproval ? (
          <form
            action={rejectProxyApprovalAction.bind(null, step.id)}
            className="mt-3 grid gap-2"
          >
            <input
              name="comment"
              required
              minLength={2}
              placeholder="대리결재 반려 사유"
              className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-xs outline-none transition placeholder:text-[#9aa4b2] focus:border-[#8a1f1f] focus:ring-2 focus:ring-[#f4c7c7]"
            />
            <div className="flex justify-end">
              <ConfirmSubmitButton
                message="이 대리결재를 반려하시겠습니까?"
                type="submit"
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.dangerOutline,
                  "h-9 px-3 text-sm",
                )}
              >
                대리결재 반려
              </ConfirmSubmitButton>
            </div>
          </form>
        ) : null}
      </div>
    </li>
  );
}

function getTimelineTone(status: ApprovalStep["status"]) {
  switch (status) {
    case "pending":
      return {
        marker: "border-[#b8d9d7] bg-[#196b69] text-white",
        card: "border-[#b8d9d7] bg-[#e5f2f1]",
      };
    case "approved":
      return {
        marker: "border-[#196b69] bg-[#196b69] text-white",
        card: "border-[#eef1f5] bg-white",
      };
    case "rejected":
      return {
        marker: "border-[#f0c6c6] bg-[#8a1f1f] text-white",
        card: "border-[#f0c6c6] bg-[#fff1f1]",
      };
    case "waiting":
    default:
      return {
        marker: "border-[#cfd6e3] bg-[#f7f9fc] text-[#697386]",
        card: "border-[#eef1f5] bg-white",
      };
  }
}

function getTimelineDescription(step: ApprovalStep) {
  switch (step.status) {
    case "pending":
      return "현재 결재 차례입니다.";
    case "approved":
      if (step.proxyApprovedBy) {
        return `대리 승인 처리일: ${formatDateTime(step.actedAt)}`;
      }

      return `승인 처리일: ${formatDateTime(step.actedAt)}`;
    case "rejected":
      if (step.decisionType === "PROXY_REJECT") {
        return `대리결재 반려일: ${formatDateTime(step.actedAt)}`;
      }

      return `반려 처리일: ${formatDateTime(step.actedAt)}`;
    case "waiting":
    default:
      return "앞 단계가 끝나면 결재 차례가 됩니다.";
  }
}

function canProxyApproveThroughStep(
  document: ApprovalDocument,
  step: ApprovalStep,
  currentUserId?: string,
  currentUserRole?: string,
) {
  if (!currentUserId) {
    return false;
  }

  if (document.status !== "submitted" && document.status !== "in_progress") {
    return false;
  }

  if (step.status !== "pending" && step.status !== "waiting") {
    return false;
  }

  const currentStep = document.approvalSteps.find(
    (candidate) => candidate.status === "pending",
  );

  if (!currentStep || step.order < currentStep.order) {
    return false;
  }

  const canActAsProxy =
    currentUserRole === "ADMIN" ||
    currentUserRole === "admin" ||
    document.drafterId === currentUserId ||
    document.approvalSteps.some(
      (candidate) => candidate.approverId === currentUserId,
    );

  if (!canActAsProxy) {
    return false;
  }

  return !(step.id === currentStep.id && step.approverId === currentUserId);
}

function canRejectProxyStep(
  document: ApprovalDocument,
  step: ApprovalStep,
  currentUserId?: string,
  currentUserRole?: string,
) {
  if (!currentUserId) {
    return false;
  }

  if (
    document.status !== "submitted" &&
    document.status !== "in_progress" &&
    document.status !== "approved"
  ) {
    return false;
  }

  if (
    step.status !== "approved" ||
    step.decisionType !== "PROXY" ||
    !step.proxyApprovedBy
  ) {
    return false;
  }

  if (currentUserRole === "ADMIN") {
    return true;
  }

  if (
    step.approverId === currentUserId ||
    step.proxyApprovedBy.id === currentUserId
  ) {
    return true;
  }

  return document.approvalSteps.some(
    (candidate) =>
      candidate.order > step.order && candidate.approverId === currentUserId,
  );
}
