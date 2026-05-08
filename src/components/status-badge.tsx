import {
  approvalStepStatusLabels,
  documentStatusLabels,
  type ApprovalStepStatus,
  type DocumentStatus,
} from "@/lib/mock-data";

const documentTone: Record<DocumentStatus, string> = {
  draft: "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]",
  submitted: "border-[#b8d9d7] bg-[#e5f2f1] text-[#0f5553]",
  in_progress: "border-[#b9c9ea] bg-[#eaf0fb] text-[#274f9f]",
  approved: "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]",
  rejected: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
  recalled: "border-[#ddd4c6] bg-[#faf6ef] text-[#72512a]",
};

const stepTone: Record<ApprovalStepStatus, string> = {
  waiting: "border-[#cfd6e3] bg-[#f7f9fc] text-[#697386]",
  pending: "border-[#b8d9d7] bg-[#e5f2f1] text-[#0f5553]",
  approved: "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]",
  rejected: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
};

type StatusBadgeProps =
  | {
      type: "document";
      status: DocumentStatus;
    }
  | {
      type: "step";
      status: ApprovalStepStatus;
    };

export function StatusBadge(props: StatusBadgeProps) {
  const label =
    props.type === "document"
      ? documentStatusLabels[props.status]
      : approvalStepStatusLabels[props.status];
  const tone =
    props.type === "document" ? documentTone[props.status] : stepTone[props.status];

  return (
    <span
      className={[
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
        tone,
      ].join(" ")}
    >
      {label}
    </span>
  );
}
