import { Suspense } from "react";
import { DraftForm } from "@/components/draft-form";
import { PageTitle } from "@/components/page-title";
import {
  getActiveDocumentTemplates,
  getApprovalCandidateUsers,
} from "@/lib/approval-queries";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function NewDraftPage() {
  return (
    <>
      <PageTitle
        title="기안작성"
        description="문서 양식을 선택하고 결재 문서를 작성합니다."
      />

      <Suspense fallback={<DraftFormFallback />}>
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
      }))}
    />
  );
}

function DraftFormFallback() {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5">
      <p className="text-sm font-semibold text-[#394150]">
        기안 양식을 불러오는 중입니다.
      </p>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#edf1f5]">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[#196b69]" />
      </div>
    </section>
  );
}
