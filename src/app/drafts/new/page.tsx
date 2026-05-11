import { Suspense } from "react";
import { DraftForm } from "@/components/draft-form";
import { PageTitle } from "@/components/page-title";
import {
  getActiveDocumentTemplates,
  getApprovalCandidateUsers,
} from "@/lib/approval-queries";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireUser } from "@/lib/auth";
import { RouteContentSkeleton } from "@/components/route-loading-shell";

export const dynamic = "force-dynamic";

export default function NewDraftPage() {
  return (
    <>
      <PageTitle
        title="기안작성"
        description="문서 양식을 선택하고 결재 문서를 작성합니다."
      />

      <Suspense fallback={<RouteContentSkeleton variant="draft" />}>
        <DraftFormContent />
      </Suspense>
    </>
  );
}

async function DraftFormContent() {
  const user = await requireUser();
  const [templates, approverCandidates, attachmentPolicy] = await Promise.all([
    getActiveDocumentTemplates(),
    getApprovalCandidateUsers(user.id),
    getAttachmentPolicy(),
  ]);

  return (
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
        positionLevel: candidate.position.level,
        profileImageStorageKey: candidate.profileImageStorageKey,
        profileImageUpdatedAt:
          candidate.profileImageUpdatedAt?.toISOString() ?? null,
      }))}
    />
  );
}
