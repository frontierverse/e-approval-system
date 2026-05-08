import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalDecisionForm } from "@/components/approval-decision-form";
import { ApprovalTimeline } from "@/components/approval-timeline";
import { NotificationDocumentReadMarker } from "@/components/notification-document-read-marker";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/status-badge";
import { getReadableDocumentById } from "@/lib/approval-queries";
import { formatFileSize } from "@/lib/attachment-storage";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { requireUser } from "@/lib/auth";
import {
  getArchivePolicyText,
  getDocumentArchiveInfo,
} from "@/lib/document-archive-policy";
import {
  formatDate,
  formatDateTime,
  getApprovalProgress,
  getCurrentApprovalStep,
} from "@/lib/mock-data";
import { decideDocumentAction, submitDocumentAction } from "./actions";

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitError?: string }>;
}) {
  const { id } = await params;
  const { submitError } = await searchParams;
  const user = await requireUser();
  const document = await getReadableDocumentById(id, user.id, user.role);

  if (!document) {
    notFound();
  }

  const currentStep = getCurrentApprovalStep(document);
  const currentApprover = currentStep?.approver ?? null;
  const progress = getApprovalProgress(document);
  const listHref = document.drafterId === user.id ? "/sent" : "/inbox";
  const documentLabel = document.documentNo || "임시문서";
  const canSubmitDraft =
    document.status === "draft" &&
    document.drafterId === user.id &&
    document.approvalSteps.length > 0;
  const canDecide =
    currentStep?.approverId === user.id &&
    (document.status === "submitted" || document.status === "in_progress");
  const progressLabel =
    progress.total > 0
      ? `진행 ${progress.approved}/${progress.total}`
      : "진행 0/0";
  const progressPercent =
    progress.total > 0
      ? Math.round((progress.approved / progress.total) * 100)
      : 0;
  const archiveInfo = getDocumentArchiveInfo(document);

  return (
    <>
      <NotificationDocumentReadMarker documentId={document.id} />
      <PageTitle
        title={document.title}
        description={`${documentLabel} / ${document.templateName}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {canSubmitDraft ? (
              <form action={submitDocumentAction.bind(null, document.id)}>
                <button
                  type="submit"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.primary,
                    "h-10 px-4 text-sm",
                  )}
                >
                  결재 요청
                </button>
              </form>
            ) : null}
            <Link
              href={listHref}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-10 px-4 text-sm",
              )}
            >
              목록으로
            </Link>
          </div>
        }
      />

      {submitError ? (
        <p className="mb-5 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-4 py-3 text-sm text-[#8a1f1f]">
          {submitError}
        </p>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <article className="rounded-md border border-[#d9dee7] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] pb-4">
              <div>
                <p className="text-sm font-semibold text-[#697386]">문서 상태</p>
                <div className="mt-2 flex items-center gap-3">
                  <StatusBadge type="document" status={document.status} />
                  <span className="text-sm text-[#394150]">
                    {progressLabel}
                  </span>
                </div>
                <div className="mt-3 h-2 w-48 max-w-full rounded-full bg-[#edf1f5]">
                  <div
                    className="h-full rounded-full bg-[#196b69]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <div className="text-right text-sm text-[#697386]">
                <p>작성 {formatDateTime(document.createdAt)}</p>
                <p>제출 {formatDateTime(document.submittedAt)}</p>
                <p className="mt-1">완료 {formatDateTime(document.completedAt)}</p>
              </div>
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <SummaryItem label="작성자" value={document.drafter.name} />
              <SummaryItem
                label="작성자 소속"
                value={
                  [document.drafter.departmentName, document.drafter.positionName]
                    .filter(Boolean)
                    .join(" / ")
                }
              />
              <SummaryItem label="카테고리" value={document.category} />
              <SummaryItem
                label="현재 결재자"
                value={
                  currentApprover
                    ? `${currentApprover.name} / ${currentApprover.positionName}`
                    : "-"
                }
              />
              <SummaryItem
                label="첨부파일"
                value={`${document.attachmentCount}개`}
              />
              <SummaryItem
                label="보관 정책"
                value={
                  archiveInfo.applies && archiveInfo.reviewAt
                    ? `${archiveInfo.isReviewDue ? "보관 검토 대상" : "보관 검토"} · ${formatDate(archiveInfo.reviewAt)}`
                    : getArchivePolicyText(archiveInfo)
                }
              />
            </dl>
          </article>

          <article className="rounded-md border border-[#d9dee7] bg-white p-5">
            <h2 className="text-base font-semibold">문서 본문</h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#394150]">
              {document.content}
            </p>
          </article>

          <article className="rounded-md border border-[#d9dee7] bg-white p-5">
            <h2 className="text-base font-semibold">첨부파일</h2>
            {document.attachments.length > 0 ? (
              <ul className="mt-4 divide-y divide-[#eef1f5] rounded-md border border-[#eef1f5]">
                {document.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#16181d]">
                        {attachment.originalName}
                      </p>
                      <p className="mt-1 text-xs text-[#697386]">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                    <Link
                      href={`/attachments/${attachment.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
                    >
                      다운로드
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
                첨부된 파일이 없습니다.
              </div>
            )}
          </article>

          <article className="rounded-md border border-[#d9dee7] bg-white p-5">
            <h2 className="text-base font-semibold">감사 이력</h2>
            <ol className="mt-5 space-y-4">
              {document.histories.map((history) => (
                <li
                  key={history.id}
                  className="rounded-md border border-[#eef1f5] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#16181d]">
                      {history.action}
                    </p>
                    <time className="text-xs text-[#697386]">
                      {formatDateTime(history.createdAt)}
                    </time>
                  </div>
                  <p className="mt-2 text-sm text-[#394150]">
                    {history.description}
                  </p>
                  <p className="mt-1 text-xs text-[#697386]">
                    {history.actorName ?? "-"}
                  </p>
                </li>
              ))}
            </ol>
          </article>
        </div>

        <aside className="space-y-6">
          {canDecide ? (
            <ApprovalDecisionForm
              action={decideDocumentAction.bind(null, document.id)}
            />
          ) : null}

          <ApprovalTimeline document={document} />
        </aside>
      </section>
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[#697386]">{label}</dt>
      <dd className="mt-1 font-medium text-[#394150]">{value}</dd>
    </div>
  );
}
