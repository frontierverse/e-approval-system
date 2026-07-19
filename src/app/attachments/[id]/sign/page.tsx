import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentSignaturePlacement } from "@/components/attachment-signature-placement";
import { PageTitle } from "@/components/page-title";
import {
  getAttachmentPreviewKind,
  isSignableAttachmentFile,
} from "@/lib/attachment-preview";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ApprovalStepStatus,
  DocumentStatus,
} from "@/generated/prisma/client";
import { createSignedAttachmentAction } from "./actions";

export const metadata: Metadata = {
  title: "첨부파일 도장 찍기",
};

export default async function AttachmentSignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const attachment = await prisma.attachment.findFirst({
    where: {
      id,
      signedSourceAttachmentId: null,
      document: getReadableDocumentWhere(user.id, user.role),
    },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      document: {
        select: {
          id: true,
          title: true,
          documentNo: true,
          status: true,
          approvalSteps: {
            select: {
              approverId: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!attachment) {
    notFound();
  }

  const previewKind = getAttachmentPreviewKind(
    attachment.originalName,
    attachment.mimeType,
  );
  const canSignAttachment = isSignableAttachmentFile(
    attachment.originalName,
    attachment.mimeType,
  );
  const isCurrentApprover = attachment.document.approvalSteps.some(
    (step) =>
      step.approverId === user.id && step.status === ApprovalStepStatus.PENDING,
  );
  const isActiveDocument =
    attachment.document.status === DocumentStatus.SUBMITTED ||
    attachment.document.status === DocumentStatus.IN_PROGRESS;
  const canPlaceSignature =
    canSignAttachment &&
    Boolean(previewKind) &&
    Boolean(user.signatureImageStorageProvider) &&
    Boolean(user.signatureImageStorageKey) &&
    isCurrentApprover &&
    isActiveDocument;

  return (
    <>
      <PageTitle
        title="첨부파일 도장 찍기"
        description={`${attachment.document.documentNo ?? "임시문서"} / ${attachment.document.title}`}
        action={
          <Link
            href={`/documents/${attachment.document.id}`}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-10 px-4 text-sm",
            )}
          >
            문서로 돌아가기
          </Link>
        }
      />

      {!canSignAttachment || !previewKind ? (
        <UnavailableMessage
          title="도장 찍기를 지원하지 않는 첨부파일입니다"
          description="PDF, JPG, PNG 첨부파일에서 사용할 수 있습니다."
          documentId={attachment.document.id}
        />
      ) : !user.signatureImageStorageProvider || !user.signatureImageStorageKey ? (
        <UnavailableMessage
          title="등록된 도장/서명 이미지가 없습니다"
          description="내 계정에서 결재 도장/서명 이미지를 먼저 등록하세요."
          documentId={attachment.document.id}
          actionHref="/account"
          actionLabel="도장 등록"
        />
      ) : !isCurrentApprover || !isActiveDocument ? (
        <UnavailableMessage
          title="현재 결재 차례에서만 도장을 찍을 수 있습니다"
          description="승인 대기 중인 결재자가 진행 중 문서에서 사용할 수 있습니다."
          documentId={attachment.document.id}
        />
      ) : canPlaceSignature ? (
        <AttachmentSignaturePlacement
          action={createSignedAttachmentAction.bind(null, attachment.id)}
          fileName={attachment.originalName}
          previewHref={`/attachments/${attachment.id}/preview`}
          previewKind={previewKind}
          signatureHref={`/signature-images/${user.id}`}
        />
      ) : null}
    </>
  );
}

function UnavailableMessage({
  actionHref,
  actionLabel,
  description,
  documentId,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  documentId: string;
  title: string;
}) {
  return (
    <section className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-5 py-8 text-center">
      <h2 className="text-base font-semibold text-[#16181d]">{title}</h2>
      <p className="mt-2 text-sm text-[#697386]">{description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 px-4 text-sm",
            )}
          >
            {actionLabel}
          </Link>
        ) : null}
        <Link
          href={`/documents/${documentId}`}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-10 px-4 text-sm",
          )}
        >
          문서로 돌아가기
        </Link>
      </div>
    </section>
  );
}
