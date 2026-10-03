import { randomUUID } from "node:crypto";
import { getAttachmentStorageConfig } from "@/lib/attachment-storage-core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResourceForm } from "@/components/resource-form";
import { PageTitle } from "@/components/page-title";
import { getResourceOptions } from "@/lib/resource-library-queries";
import { requireUser } from "@/lib/auth";
import { getResourcePostForEdit } from "@/lib/resource-library";
import {
  isResourceCategory,
  normalizeResourceEducationLevel,
} from "@/lib/resource-library-core";
import { updateResourceAction } from "../../actions";

export const metadata: Metadata = {
  title: "자료 수정",
};

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [resource, attachmentPolicy] = await Promise.all([
    getResourcePostForEdit({
      postId: id,
      userId: user.id,
      userRole: user.role,
    }),
    getResourceOptions({ actorId: user.id }).then(result => result.attachmentPolicy),
  ]);

  if (!resource) {
    notFound();
  }

  return (
    <>
      <PageTitle
        title="자료 수정"
        description="등록한 자료의 제목, 내용, 첨부파일을 수정합니다."
      />
      <ResourceForm
        actorId={user.id}
        initialRequestId={randomUUID()}
        directUploadSupported={getAttachmentStorageConfig(process.env).provider === "supabase-storage"}
        action={updateResourceAction.bind(null, resource.id)}
        attachmentPolicy={attachmentPolicy}
        cancelHref={`/resources/${resource.id}`}
        existingAttachments={resource.attachments.map((attachment) => ({
          id: attachment.id,
          mimeType: attachment.mimeType,
          originalName: attachment.originalName,
          size: attachment.size,
        }))}
        initialValues={{
          title: resource.title,
          summary: resource.summary,
          category: isResourceCategory(resource.category)
            ? resource.category
            : "bajaul",
          educationLevel: normalizeResourceEducationLevel(
            resource.educationLevel ?? undefined,
          ),
        }}
        resourceId={resource.id}
        expectedUpdatedAt={resource.updatedAt}
        mode="edit"
      />
    </>
  );
}
