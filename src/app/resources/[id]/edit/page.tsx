import { notFound } from "next/navigation";
import { ResourceForm } from "@/components/resource-form";
import { PageTitle } from "@/components/page-title";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireUser } from "@/lib/auth";
import { getResourcePostForEdit } from "@/lib/resource-library";
import { updateResourceAction } from "../../actions";

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
    getAttachmentPolicy(),
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
          category:
            resource.category === "corporation" ||
            resource.category === "cafe" ||
            resource.category === "bajaul"
              ? resource.category
              : "bajaul",
        }}
        mode="edit"
      />
    </>
  );
}
