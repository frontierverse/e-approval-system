import { randomUUID } from "node:crypto";
import { getAttachmentStorageConfig } from "@/lib/attachment-storage-core";
import type { Metadata } from "next";
import { ResourceForm } from "@/components/resource-form";
import { PageTitle } from "@/components/page-title";
import { getResourceOptions } from "@/lib/resource-library-queries";
import { requireUser } from "@/lib/auth";
import {
  normalizeResourceCategory,
  normalizeResourceEducationLevel,
} from "@/lib/resource-library-core";
import { createResourceAction } from "../actions";

export const metadata: Metadata = {
  title: "자료 업로드",
};

type NewResourcePageSearchParams = {
  category?: string;
  level?: string;
};

export default async function NewResourcePage({
  searchParams,
}: {
  searchParams: Promise<NewResourcePageSearchParams>;
}) {
  const user = await requireUser();
  const { category, level } = await searchParams;
  const initialCategory = normalizeResourceCategory(category);
  const initialEducationLevel =
    initialCategory === "education"
      ? normalizeResourceEducationLevel(level)
      : "";
  const { attachmentPolicy } = await getResourceOptions({ actorId: user.id });

  return (
    <>
      <PageTitle
        title="자료 업로드"
        description="법인, 카페, 바자울, 교육 중 자료를 올릴 공간을 선택해 등록합니다."
      />
      <ResourceForm
        actorId={user.id}
        initialRequestId={randomUUID()}
        directUploadSupported={getAttachmentStorageConfig(process.env).provider === "supabase-storage"}
        action={createResourceAction}
        attachmentPolicy={attachmentPolicy}
        initialValues={{
          category: initialCategory,
          educationLevel: initialEducationLevel,
          summary: "",
          title: "",
        }}
        cancelHref={`/resources?category=${initialCategory}`}
        mode="create"
      />
    </>
  );
}
