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
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { UserIdentity } from "@/components/user-identity";
import {
  getAttachmentPreviewKind,
  isSignableAttachmentFile,
} from "@/lib/attachment-preview";
import { getReadableDocumentById } from "@/lib/approval-queries";
import {
  canDeleteDraftDocumentByPolicy,
  canRecallDocumentByPolicy,
} from "@/lib/approval-permissions-core";
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
  deleteSignedAttachmentAction,
  deleteDraftDocumentAction,
  proxyApproveDocumentAction,
  recallDocumentAction,
  rejectProxyApprovalAction,
  submitDocumentAction,
  uploadSignedAttachmentAction,
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
  const canDeleteDraft = canDeleteDraftDocumentByPolicy(user.id, document);
  const canRecall = canRecallDocumentByPolicy(user.id, document);
  const canDecide =
    currentStep?.approverId === user.id &&
    (document.status === "submitted" || document.status === "in_progress");
  const hasSignatureImage = Boolean(user.signatureImageStorageKey);
  const originalAttachments = document.attachments.filter(
    (attachment) => !attachment.signedSourceAttachmentId,
  );
  const signedAttachments = document.attachments.filter(
    (attachment) => attachment.signedSourceAttachmentId,
  );
  const attachmentNameById = new Map(
    document.attachments.map((attachment) => [
      attachment.id,
      attachment.originalName,
    ]),
  );
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
            label:
              document.status === "rejected"
                ? "반려"
                : document.status === "recalled"
                  ? "회수"
                  : "완료",
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
                <PendingSubmitButton
                  type="submit"
                  pendingLabel="문서 생성 중"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.primary,
                    "h-10 px-4 text-sm",
                  )}
                >
                  결재 요청
                </PendingSubmitButton>
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
            {canDeleteDraft ? (
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
              <SummaryItem label="카테고리" value={document.category} />
              <SummaryItem
                label="첨부파일"
                value={
                  signedAttachments.length > 0
                    ? `원본 ${originalAttachments.length}개 / 서명본 ${signedAttachments.length}개`
                    : `${originalAttachments.length}개`
                }
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
            {originalAttachments.length > 0 ? (
              <ul className="mt-4 divide-y divide-[#eef1f5] rounded-md border border-[#eef1f5]">
                {originalAttachments.map((attachment) => {
                  const canSignOriginal =
                    canDecide &&
                    isSignableAttachmentFile(
                      attachment.originalName,
                      attachment.mimeType,
                    );

                  return (
                    <li key={attachment.id} className="px-4 py-3">
                      <AttachmentFileRow
                        fileName={attachment.originalName}
                        size={attachment.size}
                        thumbnailHref={
                          getAttachmentPreviewKind(
                            attachment.originalName,
                            attachment.mimeType,
                          ) === "image"
                            ? `/attachments/${attachment.id}/preview`
                            : undefined
                        }
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canSignOriginal ? (
                          hasSignatureImage ? (
                            <Link
                              href={`/attachments/${attachment.id}/sign`}
                              className={buttonClass(
                                buttonStyles.base,
                                buttonStyles.save,
                                "h-9 px-3 text-sm",
                              )}
                            >
                              도장 찍기
                            </Link>
                          ) : (
                            <Link
                              href="/account"
                              className={buttonClass(
                                buttonStyles.base,
                                buttonStyles.neutral,
                                "h-9 px-3 text-sm",
                              )}
                            >
                              도장 등록
                            </Link>
                          )
                        ) : null}
                        <AttachmentPreviewButton
                          downloadHref={`/attachments/${attachment.id}`}
                          fileName={attachment.originalName}
                          mimeType={attachment.mimeType}
                          previewHref={`/attachments/${attachment.id}/preview`}
                        />
                        <a
                          href={`/attachments/${attachment.id}`}
                          className={buttonClass(
                            buttonStyles.base,
                            buttonStyles.neutral,
                            "h-9 px-3 text-sm",
                          )}
                        >
                          다운로드
                        </a>
                      </div>
                      {canDecide ? (
                        <form
                          action={uploadSignedAttachmentAction.bind(
                            null,
                            document.id,
                            attachment.id,
                          )}
                          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <input
                            aria-label={`${attachment.originalName} 서명본 파일`}
                            name="signedAttachment"
                            type="file"
                            className="block h-9 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white text-xs text-[#394150] file:mr-2 file:h-full file:border-0 file:bg-[#eef2f7] file:px-3 file:text-xs file:font-semibold file:text-[#394150]"
                          />
                          <button
                            type="submit"
                            className={buttonClass(
                              buttonStyles.base,
                              buttonStyles.save,
                              "h-9 px-3 text-sm",
                            )}
                          >
                            서명본 업로드
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
                첨부된 파일이 없습니다.
              </div>
            )}
          </article>

          <article className="rounded-md border border-[#d9dee7] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">서명본</h2>
              <span className="rounded-full bg-[#eef7f6] px-2.5 py-1 text-xs font-semibold text-[#196b69]">
                {signedAttachments.length}개
              </span>
            </div>
            {signedAttachments.length > 0 ? (
              <ul className="mt-4 divide-y divide-[#eef1f5] rounded-md border border-[#eef1f5]">
                {signedAttachments.map((attachment) => {
                  const canDeleteSignedAttachment =
                    user.role === "ADMIN" ||
                    (canDecide && attachment.signedBy?.id === user.id);

                  return (
                    <li
                      key={attachment.id}
                      id={`signed-${attachment.id}`}
                      className="px-4 py-3"
                    >
                      <AttachmentFileRow
                        fileName={attachment.originalName}
                        note="서명본"
                        size={attachment.size}
                        thumbnailHref={
                          getAttachmentPreviewKind(
                            attachment.originalName,
                            attachment.mimeType,
                          ) === "image"
                            ? `/attachments/${attachment.id}/preview`
                            : undefined
                        }
                        action={
                          <div className="flex flex-wrap justify-end gap-2">
                            <AttachmentPreviewButton
                              downloadHref={`/attachments/${attachment.id}`}
                              fileName={attachment.originalName}
                              mimeType={attachment.mimeType}
                              previewHref={`/attachments/${attachment.id}/preview`}
                            />
                            <a
                              href={`/attachments/${attachment.id}`}
                              className={buttonClass(
                                buttonStyles.base,
                                buttonStyles.neutral,
                                "h-9 px-3 text-sm",
                              )}
                            >
                              다운로드
                            </a>
                            {canDeleteSignedAttachment ? (
                              <form
                                action={deleteSignedAttachmentAction.bind(
                                  null,
                                  document.id,
                                  attachment.id,
                                )}
                              >
                                <ConfirmSubmitButton
                                  message="이 서명본을 삭제하시겠습니까?"
                                  type="submit"
                                  className={buttonClass(
                                    buttonStyles.base,
                                    buttonStyles.dangerOutline,
                                    "h-9 px-3 text-sm",
                                  )}
                                >
                                  삭제
                                </ConfirmSubmitButton>
                              </form>
                            ) : null}
                          </div>
                        }
                      />
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#697386]">
                        <span>
                          원본:{" "}
                          {attachment.signedSourceAttachmentId
                            ? attachmentNameById.get(
                                attachment.signedSourceAttachmentId,
                              ) ?? "원본 첨부파일"
                            : "원본 첨부파일"}
                        </span>
                        {attachment.signedBy ? (
                          <span>처리자: {attachment.signedBy.name}</span>
                        ) : null}
                        {attachment.signedAt ? (
                          <span>생성: {formatDateTime(attachment.signedAt)}</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
                생성된 서명본이 없습니다.
              </div>
            )}
          </article>

          <div className="xl:hidden">
            <ApprovalTimeline
              document={document}
              currentUserId={user.id}
              currentUserRole={user.role}
              progressLabel={progressLabel}
              progressPercent={progressPercent}
              proxyApproveDocumentAction={proxyApproveDocumentAction.bind(
                null,
                document.id,
              )}
              rejectProxyApprovalAction={rejectProxyApprovalAction.bind(
                null,
                document.id,
              )}
            />
          </div>

          <DocumentAuditHistory histories={document.histories} />
        </div>

        <aside className="space-y-6">
          {canDecide ? (
            <ApprovalDecisionForm
              action={decideDocumentAction.bind(null, document.id)}
            />
          ) : null}

          <div className="hidden xl:block">
            <ApprovalTimeline
              document={document}
              currentUserId={user.id}
              currentUserRole={user.role}
              progressLabel={progressLabel}
              progressPercent={progressPercent}
              proxyApproveDocumentAction={proxyApproveDocumentAction.bind(
                null,
                document.id,
              )}
              rejectProxyApprovalAction={rejectProxyApprovalAction.bind(
                null,
                document.id,
              )}
            />
          </div>
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
