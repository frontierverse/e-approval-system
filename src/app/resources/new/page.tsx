import { ResourceForm } from "@/components/resource-form";
import { PageTitle } from "@/components/page-title";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireUser } from "@/lib/auth";
import { createResourceAction } from "../actions";

export default async function NewResourcePage() {
  await requireUser();
  const attachmentPolicy = await getAttachmentPolicy();

  return (
    <>
      <PageTitle
        title="자료 업로드"
        description="직원들과 공유할 업무 자료나 공지사항을 등록합니다."
      />
      <ResourceForm
        action={createResourceAction}
        attachmentPolicy={attachmentPolicy}
        mode="create"
      />
    </>
  );
}
