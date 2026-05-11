import { StatusBadge } from "@/components/status-badge";
import { UserIdentity } from "@/components/user-identity";
import {
  type ApprovalDocument,
  type ApprovalStep,
  formatDateTime,
} from "@/lib/mock-data";

type ApprovalTimelineProps = {
  document: ApprovalDocument;
};

export function ApprovalTimeline({ document }: ApprovalTimelineProps) {
  const rejectedStep = document.approvalSteps.find(
    (step) => step.status === "rejected",
  );

  return (
    <article className="rounded-md border border-[#d9dee7] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">결재 진행</h2>
          <p className="mt-1 text-sm text-[#697386]">
            결재 순서와 현재 처리해야 할 단계를 확인합니다.
          </p>
        </div>
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

function TimelineStep({ step, isLast }: { step: ApprovalStep; isLast: boolean }) {
  const tone = getTimelineTone(step.status);

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

        {step.comment ? (
          <p className="mt-3 rounded-md bg-[#fbfcfd] px-3 py-2 text-sm leading-6 text-[#394150]">
            {step.comment}
          </p>
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
      return `승인 처리일: ${formatDateTime(step.actedAt)}`;
    case "rejected":
      return `반려 처리일: ${formatDateTime(step.actedAt)}`;
    case "waiting":
    default:
      return "앞 단계가 끝나면 결재 차례가 됩니다.";
  }
}
