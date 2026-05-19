import { ResourceForm } from "@/components/resource-form";
import { PageTitle } from "@/components/page-title";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireUser } from "@/lib/auth";
import { normalizeResourceCategory } from "@/lib/resource-library-core";
import { createResourceAction } from "../actions";

type NewResourcePageSearchParams = {
  category?: string;
};

export default async function NewResourcePage({
  searchParams,
}: {
  searchParams: Promise<NewResourcePageSearchParams>;
}) {
  await requireUser();
  const { category } = await searchParams;
  const initialCategory = normalizeResourceCategory(category);
  const attachmentPolicy = await getAttachmentPolicy();

  return (
    <>
      <PageTitle
        title="자료 업로드"
        description="법인, 카페, 바자울 중 자료를 올릴 공간을 선택해 등록합니다."
      />
      <ResourceForm
        action={createResourceAction}
        attachmentPolicy={attachmentPolicy}
        initialValues={{
          category: initialCategory,
          summary: "",
          title: "",
        }}
        mode="create"
      />
    </>
  );
}
