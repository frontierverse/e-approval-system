import type { Metadata } from "next";
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
import { APPROVAL_AUTHORITY_POSITION_NAME } from "@/lib/approval-authority";

export const metadata: Metadata = {
  title: "기안작성",
};

export const dynamic = "force-dynamic";

export default function NewDraftPage() {
  return (
    <>
      <PageTitle title="기안작성" compact />

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
    getApprovalCandidateUsers(user.id, {
      positionName: APPROVAL_AUTHORITY_POSITION_NAME,
    }),
    getAttachmentPolicy(),
  ]);

  return (
    <DraftForm
      templates={templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        schema: template.schema,
      }))}
      attachmentPolicy={attachmentPolicy}
      allowedApproverPositionName={APPROVAL_AUTHORITY_POSITION_NAME}
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
      defaultApproverIds={
        approverCandidates.length === 1 ? [approverCandidates[0].id] : []
      }
    />
  );
}
