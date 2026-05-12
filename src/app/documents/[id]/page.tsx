import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalDecisionForm } from "@/components/approval-decision-form";
import { ApprovalTimeline } from "@/components/approval-timeline";
import { AttachmentFileRow } from "@/components/attachment-file-row";
import { AttachmentPreviewButton } from "@/components/attachment-preview-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DocumentAuditHistory } from "@/components/document-audit-history";
import { NotificationDocumentReadMarker } from "@/components/notification-document-read-marker";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/status-badge";
import { UserIdentity } from "@/components/user-identity";
import { getReadableDocumentById } from "@/lib/approval-queries";
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
import {
  decideDocumentAction,
  deleteDraftDocumentAction,
  recallDocumentAction,
  submitDocumentAction,
} from "./actions";

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ actionError?: string; submitError?: string }>;
}) {
  const { id } = await params;
  const { actionError, submitError } = await searchParams;
  const user = await requireUser();
  const document = await getReadableDocumentById(id, user.id, user.role);

  if (!document) {
    notFound();
  }

  const currentStep = getCurrentApprovalStep(document);
  const currentApprover = currentStep?.approver ?? null;
  const progress = getApprovalProgress(document);
  const isOwnDocument = document.drafterId === user.id;
  const isEditableDraft =
    document.status === "draft" || document.status === "recalled";
  const listHref = isOwnDocument
    ? isEditableDraft
      ? "/drafts"
      : "/sent"
    : "/inbox";
  const documentLabel = document.documentNo || "임시문서";
  const canSubmitDraft =
    document.status === "draft" &&
    isOwnDocument &&
    document.approvalSteps.length > 0;
  const canEditDraft = isEditableDraft && isOwnDocument;
  const canRecall =
    document.status === "submitted" &&
    isOwnDocument &&
    document.approvalSteps.every(
      (step) => step.status === "waiting" || step.status === "pending",
    );
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
  const documentDates = [
    { label: "작성", value: formatDateTime(document.createdAt) },
    ...(document.submittedAt
      ? [{ label: "제출", value: formatDateTime(document.submittedAt) }]
      : []),
    ...(document.completedAt
      ? [
          {
            label: document.status === "rejected" ? "반려" : "완료",
            value: formatDateTime(document.completedAt),
          },
        ]
      : []),
  ];

  return (
    <>
      <NotificationDocumentReadMarker documentId={document.id} />
      <PageTitle
        title={document.title}
        description={`${documentLabel} / ${document.templateName}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {canEditDraft ? (
              <Link
                href={`/drafts/${document.id}/edit`}
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.save,
                  "h-10 px-4 text-sm",
                )}
              >
                수정
              </Link>
            ) : null}
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
            {canRecall ? (
              <form action={recallDocumentAction.bind(null, document.id)}>
                <ConfirmSubmitButton
                  message="결재 요청을 회수하시겠습니까?"
                  type="submit"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.dangerOutline,
                    "h-10 px-4 text-sm",
                  )}
                >
                  회수
                </ConfirmSubmitButton>
              </form>
            ) : null}
            {canEditDraft ? (
              <form action={deleteDraftDocumentAction.bind(null, document.id)}>
                <ConfirmSubmitButton
                  message="임시저장 문서를 삭제하시겠습니까?"
                  type="submit"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.danger,
                    "h-10 px-4 text-sm",
                  )}
                >
                  삭제
                </ConfirmSubmitButton>
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
      {actionError ? (
        <p className="mb-5 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-4 py-3 text-sm text-[#8a1f1f]">
          {actionError}
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
              <div className="grid gap-1 text-right text-sm text-[#697386]">
                {documentDates.map((item) => (
                  <p key={item.label}>
                    <span className="font-semibold text-[#394150]">
                      {item.label}
                    </span>{" "}
                    {item.value}
                  </p>
                ))}
              </div>
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <SummaryItem
                label="작성자"
                value={
                  <UserIdentity
                    user={document.drafter}
                    meta={[document.drafter.departmentName, document.drafter.positionName]
                      .filter(Boolean)
                      .join(" / ")}
                  />
                }
              />
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
                    ? (
                        <UserIdentity
                          user={currentApprover}
                          meta={currentApprover.positionName}
                        />
                      )
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
                    className="px-4 py-3"
                  >
                    <AttachmentFileRow
                      fileName={attachment.originalName}
                      size={attachment.size}
                      action={
                        <div className="flex flex-wrap justify-end gap-2">
                          <AttachmentPreviewButton
                            downloadHref={`/attachments/${attachment.id}`}
                            fileName={attachment.originalName}
                            mimeType={attachment.mimeType}
                            previewHref={`/attachments/${attachment.id}/preview`}
                          />
                          <Link
                            href={`/attachments/${attachment.id}`}
                            className={buttonClass(
                              buttonStyles.base,
                              buttonStyles.neutral,
                              "h-9 px-3 text-sm",
                            )}
                          >
                            다운로드
                          </Link>
                        </div>
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
                첨부된 파일이 없습니다.
              </div>
            )}
          </article>

          <DocumentAuditHistory histories={document.histories} />
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

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[#697386]">{label}</dt>
      <dd className="mt-1 font-medium text-[#394150]">{value}</dd>
    </div>
  );
}
