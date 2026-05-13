import { notFound } from "next/navigation";
import { DraftForm } from "@/components/draft-form";
import { PageTitle } from "@/components/page-title";
import {
  getActiveDocumentTemplates,
  getApprovalCandidateUsers,
  getEditableDraftDocumentById,
} from "@/lib/approval-queries";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireUser } from "@/lib/auth";
import { updateDraftAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [document, templates, approverCandidates, attachmentPolicy] =
    await Promise.all([
      getEditableDraftDocumentById(id, user.id),
      getActiveDocumentTemplates(),
      getApprovalCandidateUsers(user.id),
      getAttachmentPolicy(),
    ]);

  if (!document) {
    notFound();
  }

  return (
    <>
      <PageTitle
        title="임시저장 수정"
        description="작성 중이거나 회수한 문서를 수정합니다."
      />

      <DraftForm
        action={updateDraftAction.bind(null, document.id)}
        cancelHref={`/documents/${document.id}`}
        mode="edit"
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
        }))}
        attachmentPolicy={attachmentPolicy}
        approverCandidates={approverCandidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          departmentName: candidate.department.name,
          positionName: candidate.position.name,
          positionLevel: candidate.position.level,
          profileImageStorageKey: candidate.profileImageStorageKey,
          profileImageUpdatedAt:
            candidate.profileImageUpdatedAt?.toISOString() ?? null,
        }))}
        initialValues={{
          title: document.title,
          category: document.category,
          templateId: document.templateId,
          content: document.content,
          approverIds: document.approverIds,
        }}
        existingAttachments={document.attachments.map((attachment) => ({
          id: attachment.id,
          mimeType: attachment.mimeType,
          originalName: attachment.originalName,
          size: attachment.size,
        }))}
      />
    </>
  );
}
