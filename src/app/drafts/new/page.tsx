import { DraftForm } from "@/components/draft-form";
import { PageTitle } from "@/components/page-title";
import {
  getActiveDocumentTemplates,
  getApprovalCandidateUsers,
} from "@/lib/approval-queries";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewDraftPage() {
  const user = await requireUser();
  const [templates, approverCandidates, attachmentPolicy] = await Promise.all([
    getActiveDocumentTemplates(),
    getApprovalCandidateUsers(user.id),
    getAttachmentPolicy(),
  ]);

  return (
    <>
      <PageTitle
        title="기안작성"
        description="문서 양식을 선택하고 결재 문서를 작성합니다."
      />
      <DraftForm
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
        }))}
      />
    </>
  );
}
