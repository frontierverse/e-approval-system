"use client";

import { useEffect, useState, type ReactNode } from "react";
import { extractTextareaContentFromCompiledTemplate } from "@/lib/draft-template-content";
import { getLoginLocationLabel } from "@/lib/login-history-core";
import { formatDateTime, type ApprovalHistory } from "@/lib/mock-data";
import { createLineDiffRows, type TextDiffRow } from "@/lib/text-diff";

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
  const changes = getAuditChangeItems(history);

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
          {getHistoryDescription(history, changes)}
        </p>
        {changes.length > 0 ? <AuditChangePreview changes={changes} /> : null}
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
  const changes = getAuditChangeItems(history);
  const tone = getAuditHistoryTone(history.action);

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

      <section className="relative max-h-[min(44rem,calc(100vh-2rem))] w-full max-w-3xl overflow-auto rounded-md border border-[#d9dee7] bg-white shadow-[0_24px_70px_rgba(15,23,32,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-[#697386]">
              감사 이력 상세
            </p>
            <h3
              id={titleId}
              className={[
                "mt-2 inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
                tone.badge,
              ].join(" ")}
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
            value={getHistoryDescription(history, changes)}
          />
          {changes.length > 0 ? (
            <AuditChangeDetailRows changes={changes} />
          ) : null}
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

type AuditChangeItem =
  | {
      kind: "value";
      field: string;
      label: string;
      before: string | null;
      after: string | null;
    }
  | {
      kind: "content";
      label: string;
      before: string | null;
      after: string | null;
      beforeLength: number;
      afterLength: number;
    }
  | {
      kind: "approvalLine";
      label: string;
      before: string[];
      after: string[];
    }
  | {
      kind: "attachments";
      label: string;
      added: string[];
      removed: string[];
    };

function AuditChangePreview({ changes }: { changes: AuditChangeItem[] }) {
  const visibleChanges = changes.slice(0, 4);
  const hiddenCount = changes.length - visibleChanges.length;

  return (
    <div
      aria-label="수정 내역 요약"
      className="mt-3 flex max-w-full flex-wrap gap-2"
    >
      {visibleChanges.map((change, index) => (
        <span
          key={`${change.label}-${index}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#cfd6e3] bg-white px-2 py-1 text-xs"
        >
          <span className="shrink-0 font-semibold text-[#196b69]">
            {change.label}
          </span>
          <span className="min-w-0 truncate text-[#394150]">
            {getChangePreviewText(change)}
          </span>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-flex items-center rounded-md border border-[#cfd6e3] bg-white px-2 py-1 text-xs font-semibold text-[#697386]">
          외 {hiddenCount}개
        </span>
      ) : null}
    </div>
  );
}

function AuditChangeDetailRows({ changes }: { changes: AuditChangeItem[] }) {
  return (
    <DetailBlock label="수정 내역">
      <ul className="grid gap-3">
        {changes.map((change, index) => (
          <li
            key={`${change.label}-${index}`}
            className="border-l-2 border-[#b8d9d7] pl-3"
          >
            <p className="text-sm font-semibold text-[#16181d]">
              {change.label}
            </p>
            <AuditChangeDetail change={change} />
          </li>
        ))}
      </ul>
    </DetailBlock>
  );
}

function AuditChangeDetail({ change }: { change: AuditChangeItem }) {
  if (change.kind === "content") {
    if (change.before !== null || change.after !== null) {
      return (
        <ChangeDiffBlock
          before={formatNullableChange(change.before)}
          after={formatNullableChange(change.after)}
        />
      );
    }

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#697386]">
        <ChangePill label="변경 전" value={`${change.beforeLength}자`} />
        <span aria-hidden="true" className="text-[#8b949e]">
          →
        </span>
        <ChangePill label="변경 후" value={`${change.afterLength}자`} />
      </div>
    );
  }

  if (change.kind === "approvalLine") {
    return (
      <div className="mt-2 grid gap-2 text-xs text-[#697386]">
        <ChangePill label="변경 전" value={formatNameLine(change.before)} />
        <ChangePill label="변경 후" value={formatNameLine(change.after)} />
      </div>
    );
  }

  if (change.kind === "attachments") {
    return (
      <div className="mt-2 grid gap-2 text-xs text-[#697386]">
        {change.added.length > 0 ? (
          <ChangePill
            label="추가"
            value={`${change.added.length}개 · ${formatNameLine(change.added)}`}
          />
        ) : null}
        {change.removed.length > 0 ? (
          <ChangePill
            label="삭제"
            value={`${change.removed.length}개 · ${formatNameLine(
              change.removed,
            )}`}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 grid gap-2 text-xs text-[#697386] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
      {change.field === "status" ? (
        <StatusChangePill label="변경 전" value={change.before} />
      ) : (
        <ChangePill
          label="변경 전"
          value={formatNullableChange(change.before)}
        />
      )}
      <span aria-hidden="true" className="hidden text-[#8b949e] sm:block">
        →
      </span>
      {change.field === "status" ? (
        <StatusChangePill label="변경 후" value={change.after} />
      ) : (
        <ChangePill
          label="변경 후"
          value={formatNullableChange(change.after)}
        />
      )}
    </div>
  );
}

function ChangeDiffBlock({ before, after }: { before: string; after: string }) {
  const rows = createLineDiffRows(before, after);

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      <div aria-label="본문 변경 내용" className="max-h-72 overflow-auto">
        {rows.length > 0 ? (
          <ol className="text-sm">
            {rows.map((row, index) => (
              <DiffRow key={`${row.type}-${index}`} row={row} />
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

function DiffRow({ row }: { row: TextDiffRow }) {
  return (
    <li
      className={[
        "grid grid-cols-[0.25rem_3.5rem_minmax(0,1fr)] border-b border-[#eef1f5] last:border-b-0",
        getDiffRowClass(row.type),
      ].join(" ")}
    >
      <span aria-hidden="true" className={getDiffRowBarClass(row.type)} />
      <span
        aria-hidden="true"
        className={[
          "select-none border-r border-[#26313d] bg-[#101820] px-2 py-1.5 text-right font-mono text-xs leading-6",
          getDiffLineNumberClass(row.type),
        ].join(" ")}
      >
        {formatDiffLineNumber(row)}
      </span>
      <span className="whitespace-pre-wrap break-words px-3 py-1.5 leading-6">
        {row.text || " "}
      </span>
    </li>
  );
}

function formatDiffLineNumber(row: TextDiffRow) {
  return String(row.newLineNumber ?? row.oldLineNumber ?? "");
}

function getDiffRowBarClass(type: TextDiffRow["type"]) {
  if (type === "removed") {
    return "bg-[#d33a35]";
  }

  if (type === "added") {
    return "bg-[#2ecc71]";
  }

  return "bg-transparent";
}

function getDiffLineNumberClass(type: TextDiffRow["type"]) {
  if (type === "removed") {
    return "text-[#ff6b63]";
  }

  if (type === "added") {
    return "text-[#38f08f]";
  }

  return "text-[#7f8b98]";
}

function getDiffRowClass(type: TextDiffRow["type"]) {
  if (type === "removed") {
    return "bg-[#3b1d24] text-[#ff7a73]";
  }

  if (type === "added") {
    return "bg-[#173624] text-[#7dffad]";
  }

  return "bg-[#111820] text-[#d9e2ec]";
}

function ChangePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[#f7f9fc] px-2 py-1">
      <span className="shrink-0 font-semibold text-[#697386]">{label}</span>
      <span className="min-w-0 truncate font-medium text-[#394150]">
        {value}
      </span>
    </span>
  );
}

function StatusChangePill({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[#f7f9fc] px-2 py-1">
      <span className="shrink-0 font-semibold text-[#697386]">{label}</span>
      <StatusChangeBadge value={formatNullableChange(value)} />
    </span>
  );
}

function StatusChangeBadge({ value }: { value: string }) {
  return (
    <span
      className={[
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md border px-2 text-xs font-semibold",
        getStatusChangeBadgeClass(value),
      ].join(" ")}
    >
      {value}
    </span>
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
    <DetailBlock label={label}>
      <span
        className={[
          "min-w-0 text-sm font-medium text-[#394150]",
          mono ? "font-mono text-xs" : "",
          wrap ? "break-all" : "truncate",
        ].join(" ")}
      >
        {value}
      </span>
    </DetailBlock>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-semibold text-[#697386]">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function getAuditChangeItems(history: ApprovalHistory): AuditChangeItem[] {
  const metadata = history.metadata;

  if (!isPlainObject(metadata) || !Array.isArray(metadata.changes)) {
    return [];
  }

  return metadata.changes.flatMap((change) => {
    const item = toAuditChangeItem(change);

    return item ? [item] : [];
  });
}

function toAuditChangeItem(change: unknown): AuditChangeItem | null {
  if (!isPlainObject(change)) {
    return null;
  }

  const label = getChangeLabel(change);
  const field = typeof change.field === "string" ? change.field : "";

  if (
    field === "title" ||
    field === "template" ||
    field === "status" ||
    field === "documentNo"
  ) {
    return {
      kind: "value",
      field,
      label,
      before: getNullableString(change.before),
      after: getNullableString(change.after),
    };
  }

  if (field === "content") {
    const before = getNullableString(change.before);
    const after = getNullableString(change.after);
    const beforeBody =
      before === null ? null : extractTextareaContentFromCompiledTemplate(before);
    const afterBody =
      after === null ? null : extractTextareaContentFromCompiledTemplate(after);

    return {
      kind: "content",
      label,
      before: beforeBody,
      after: afterBody,
      beforeLength: beforeBody?.length ?? getNumber(change.beforeLength),
      afterLength: afterBody?.length ?? getNumber(change.afterLength),
    };
  }

  if (field === "approvalLine") {
    return {
      kind: "approvalLine",
      label,
      before: getApproverNames(change.before),
      after: getApproverNames(change.after),
    };
  }

  if (field === "attachments") {
    return {
      kind: "attachments",
      label,
      added: getStringArray(change.added),
      removed: getAttachmentNames(change.removed),
    };
  }

  return null;
}

function getHistoryDescription(
  history: ApprovalHistory,
  changes: AuditChangeItem[],
) {
  const fallback = `${history.action} 작업이 기록되었습니다.`;
  const description = history.description || fallback;

  if (changes.length === 0) {
    return description;
  }

  return description.split(" 변경: ")[0] || fallback;
}

function getChangePreviewText(change: AuditChangeItem) {
  if (change.kind === "content") {
    return "본문 변경";
  }

  if (change.kind === "approvalLine") {
    return `${formatNameLine(change.before)} -> ${formatNameLine(change.after)}`;
  }

  if (change.kind === "attachments") {
    return [
      change.added.length > 0 ? `추가 ${change.added.length}개` : "",
      change.removed.length > 0 ? `삭제 ${change.removed.length}개` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return `${formatNullableChange(change.before)} -> ${formatNullableChange(
    change.after,
  )}`;
}

function getChangeLabel(change: Record<string, unknown>) {
  if (typeof change.label === "string" && change.label.trim()) {
    return change.label;
  }

  if (change.field === "title") {
    return "제목";
  }

  if (change.field === "template") {
    return "문서양식";
  }

  if (change.field === "content") {
    return "본문";
  }

  if (change.field === "approvalLine") {
    return "결재선";
  }

  if (change.field === "attachments") {
    return "첨부파일";
  }

  if (change.field === "status") {
    return "상태";
  }

  if (change.field === "documentNo") {
    return "문서번호";
  }

  return "변경 항목";
}

function getNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getApproverNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isPlainObject(item) || typeof item.name !== "string") {
      return [];
    }

    return [item.name];
  });
}

function getAttachmentNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [item];
    }

    if (!isPlainObject(item) || typeof item.originalName !== "string") {
      return [];
    }

    return [item.originalName];
  });
}

function formatNameLine(names: string[]) {
  return names.length > 0 ? names.join(" -> ") : "없음";
}

function formatNullableChange(value: string | null) {
  return value && value.length > 0 ? value : "없음";
}

function getStatusChangeBadgeClass(value: string) {
  if (value === "임시저장" || value === "없음") {
    return "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]";
  }

  if (value === "결재요청") {
    return "border-[#b8d9d7] bg-[#e5f2f1] text-[#0f5553]";
  }

  if (value === "결재진행") {
    return "border-[#b9c9ea] bg-[#eaf0fb] text-[#274f9f]";
  }

  if (value === "승인완료") {
    return "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]";
  }

  if (value === "반려") {
    return "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]";
  }

  if (value === "회수") {
    return "border-[#ddd4c6] bg-[#faf6ef] text-[#72512a]";
  }

  return "border-[#cfd6e3] bg-white text-[#394150]";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  if (action.includes("PDF")) {
    return {
      marker: "border-[#bdd7f0] bg-[#245d8f] text-white",
      badge: "border-[#bdd7f0] bg-[#edf6ff] text-[#245d8f]",
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
