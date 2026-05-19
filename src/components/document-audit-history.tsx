import { formatDateTime, type ApprovalHistory } from "@/lib/mock-data";

type DocumentAuditHistoryProps = {
  histories: ApprovalHistory[];
};

export function DocumentAuditHistory({ histories }: DocumentAuditHistoryProps) {
  return (
    <article className="rounded-md border border-[#d9dee7] bg-white p-5">
      <h2 className="text-base font-semibold">감사 이력</h2>

      {histories.length > 0 ? (
        <ol aria-label="감사 이력 타임라인" className="mt-5">
          {histories.map((history, index) => (
            <AuditHistoryTimelineItem
              key={history.id}
              history={history}
              isLast={index === histories.length - 1}
            />
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
          아직 기록된 감사 이력이 없습니다.
        </div>
      )}
    </article>
  );
}

function AuditHistoryTimelineItem({
  history,
  isLast,
}: {
  history: ApprovalHistory;
  isLast: boolean;
}) {
  const tone = getAuditHistoryTone(history.action);
  const actorLabel = history.actor?.name || history.actorName || "시스템";

  return (
    <li className="relative pb-5 pl-10 last:pb-0">
      {!isLast ? (
        <span
          aria-hidden="true"
          className="absolute left-[0.9375rem] top-9 h-[calc(100%-1.5rem)] w-px bg-[#e7ecf2]"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={[
          "absolute left-0 top-0 grid size-8 place-items-center rounded-full border text-xs font-bold",
          tone.marker,
        ].join(" ")}
      >
        {history.action.slice(0, 1)}
      </span>

      <div className="rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold",
                tone.badge,
              ].join(" ")}
            >
              {history.action}
            </span>
            <span className="min-w-0 truncate text-xs font-medium text-[#697386]">
              처리자{" "}
              <span className="font-semibold text-[#394150]">
                {actorLabel}
              </span>
            </span>
          </div>
          <time
            className="text-xs font-medium text-[#697386]"
            dateTime={history.createdAt}
          >
            {formatDateTime(history.createdAt)}
          </time>
        </div>

        <p className="mt-3 text-sm leading-6 text-[#394150]">
          {history.description || `${history.action} 작업이 기록되었습니다.`}
        </p>
      </div>
    </li>
  );
}

function getAuditHistoryTone(action: string) {
  if (action.includes("대리결재") && !action.includes("반려")) {
    return {
      marker: "border-[#ead8a8] bg-[#d89b00] text-white",
      badge: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
    };
  }

  if (action.includes("반려")) {
    return {
      marker: "border-[#f0c6c6] bg-[#8a1f1f] text-white",
      badge: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
    };
  }

  if (action.includes("승인") || action.includes("완료")) {
    return {
      marker: "border-[#bddfc9] bg-[#16834a] text-white",
      badge: "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]",
    };
  }

  if (action.includes("회수") || action.includes("삭제")) {
    return {
      marker: "border-[#ddd4c6] bg-[#72512a] text-white",
      badge: "border-[#ddd4c6] bg-[#faf6ef] text-[#72512a]",
    };
  }

  if (action.includes("제출") || action.includes("결재 요청")) {
    return {
      marker: "border-[#b8d9d7] bg-[#196b69] text-white",
      badge: "border-[#b8d9d7] bg-[#e5f2f1] text-[#0f5553]",
    };
  }

  return {
    marker: "border-[#cfd6e3] bg-[#f7f9fc] text-[#697386]",
    badge: "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]",
  };
}
