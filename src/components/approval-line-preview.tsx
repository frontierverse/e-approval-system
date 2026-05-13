import type { ApprovalStep, ApprovalStepStatus } from "@/lib/mock-data";

type ApprovalLinePreviewProps = {
  steps: ApprovalStep[];
  className?: string;
  label?: string;
};

const statusLabels: Record<ApprovalStepStatus, string> = {
  waiting: "대기",
  pending: "진행중",
  approved: "승인",
  rejected: "반려",
};

const statusTone: Record<
  ApprovalStepStatus,
  { marker: string; connector: string }
> = {
  waiting: {
    marker: "border border-[#cfd7e3] bg-transparent text-[#697386]",
    connector: "bg-[#cfd7e3]",
  },
  pending: {
    marker:
      "approval-line-current border border-[#7bb9b6] bg-transparent text-[#0f5553]",
    connector: "bg-[#7bb9b6]",
  },
  approved: {
    marker: "border border-[#73bd91] bg-transparent text-[#1f7a4d]",
    connector: "bg-[#73bd91]",
  },
  rejected: {
    marker: "border border-[#de8b82] bg-transparent text-[#9f241a]",
    connector: "bg-[#de8b82]",
  },
};

export function ApprovalLinePreview({
  steps,
  className = "",
  label = "결재선",
}: ApprovalLinePreviewProps) {
  if (steps.length === 0) {
    return null;
  }

  const ariaDescription = steps
    .map(
      (step) =>
        `${step.order}차 ${step.approver.name} ${statusLabels[step.status]}`,
    )
    .join(", ");

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-[#697386]">{label}</p>
      <ol
        aria-label={`${label}: ${ariaDescription}`}
        className="mt-2 flex overflow-x-auto pb-1"
      >
        {steps.map((step, index) => {
          const tone = statusTone[step.status];
          const isLast = index === steps.length - 1;
          const isCurrent = step.status === "pending";

          return (
            <li
              key={step.id}
              className={`min-w-[4.75rem] shrink-0 ${isLast ? "w-[4.75rem]" : "flex-1"}`}
              title={`${step.order}차 ${step.approver.name} ${statusLabels[step.status]}`}
            >
              <div className="flex h-6 items-center">
                <span
                  className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${tone.marker}`}
                >
                  {step.order}
                </span>
                {!isLast ? (
                  <span
                    className={`h-px min-w-8 flex-1 ${tone.connector}`}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <p
                className={`mt-1 max-w-[4.25rem] truncate text-xs font-semibold text-[#16181d] ${
                  isCurrent ? "approval-line-current" : ""
                }`}
              >
                {step.approver.name}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
