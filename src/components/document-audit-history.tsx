"use client";

import { useEffect, useState } from "react";
import { getLoginLocationLabel } from "@/lib/login-history-core";
import { formatDateTime, type ApprovalHistory } from "@/lib/mock-data";

type DocumentAuditHistoryProps = {
  histories: ApprovalHistory[];
};

export function DocumentAuditHistory({ histories }: DocumentAuditHistoryProps) {
  const [selectedHistory, setSelectedHistory] =
    useState<ApprovalHistory | null>(null);

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
              onSelect={() => setSelectedHistory(history)}
            />
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
          아직 기록된 감사 이력이 없습니다.
        </div>
      )}

      {selectedHistory ? (
        <AuditHistoryDetailModal
          history={selectedHistory}
          onClose={() => setSelectedHistory(null)}
        />
      ) : null}
    </article>
  );
}

function AuditHistoryTimelineItem({
  history,
  isLast,
  onSelect,
}: {
  history: ApprovalHistory;
  isLast: boolean;
  onSelect: () => void;
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

      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${history.action} 감사 이력 상세 보기`}
        onClick={onSelect}
        className="block w-full cursor-pointer rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-4 py-3 text-left transition hover:border-[#cfd6e3] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
      >
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
      </button>
    </li>
  );
}

function AuditHistoryDetailModal({
  history,
  onClose,
}: {
  history: ApprovalHistory;
  onClose: () => void;
}) {
  const titleId = `audit-history-${history.id}-title`;
  const actorLabel = getActorLabel(history);
  const deviceLabel = getDeviceLabel(history);
  const locationLabel = getLoginLocationLabel(history);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[#0f1720]/55 p-4"
      role="dialog"
    >
      <button
        type="button"
        aria-label="감사 이력 상세 닫기"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <section className="relative max-h-[min(44rem,calc(100vh-2rem))] w-full max-w-xl overflow-auto rounded-md border border-[#d9dee7] bg-white shadow-[0_24px_70px_rgba(15,23,32,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-[#697386]">
              감사 이력 상세
            </p>
            <h3
              id={titleId}
              className="mt-1 text-base font-semibold text-[#16181d]"
            >
              {history.action}
            </h3>
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-[#cfd6e3] text-lg leading-none text-[#394150] transition hover:bg-[#f7f9fc]"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <dl className="grid gap-3 px-5 py-5">
          <DetailRow label="처리자" value={actorLabel} />
          <DetailRow
            label="처리 시간"
            value={formatDateTime(history.createdAt)}
          />
          <DetailRow
            label="작업 내용"
            value={
              history.description ||
              `${history.action} 작업이 기록되었습니다.`
            }
          />
          <DetailRow label="IP" value={history.ipAddress || "기록 없음"} mono />
          <DetailRow label="위치" value={locationLabel} />
          <DetailRow label="기기" value={deviceLabel} />
          <DetailRow
            label="User-Agent"
            value={history.userAgent || "기록 없음"}
            mono
            wrap
          />
        </dl>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  wrap = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-semibold text-[#697386]">{label}</dt>
      <dd
        className={[
          "min-w-0 text-sm font-medium text-[#394150]",
          mono ? "font-mono text-xs" : "",
          wrap ? "break-all" : "truncate",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function getActorLabel(history: ApprovalHistory) {
  const actor = history.actor;

  if (!actor) {
    return history.actorName || "시스템";
  }

  return [actor.name, actor.positionName, actor.departmentName]
    .filter(Boolean)
    .join(" · ");
}

function getDeviceLabel(history: ApprovalHistory) {
  return (
    [history.device, history.browser, history.os].filter(Boolean).join(" · ") ||
    "기록 없음"
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
