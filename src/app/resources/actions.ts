"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { ResourceError, resourceId, resourceTimestamp } from "@/lib/mobile-resources-core";
import { getResourceFormValues, hasResourceFormErrors, validateResourceFormValues, type ResourceFormState } from "@/lib/resource-form-state";
import { getResourceLibraryPage } from "@/lib/resource-library";
import { mutateResource } from "@/lib/resource-library-mutations";
import { createResourceServerUpload } from "@/lib/resource-uploads";
import { revalidateResourceLibrary } from "@/lib/resource-library-cache";
import { getResourceLibraryPageSize, normalizeResourceCategoryFilter, normalizeResourceEducationLevelFilter, type ResourceCategoryFilter, type ResourceEducationLevelFilter } from "@/lib/resource-library-core";

export type ResourceLibraryPageActionFilters = { category: ResourceCategoryFilter; educationLevel: ResourceEducationLevelFilter; page: number; query: string };
export async function getResourceLibraryPageAction(filters: ResourceLibraryPageActionFilters) {
  const user = await requireUser(), category = normalizeResourceCategoryFilter(filters.category);
  const normalizedCategory = category === "all" ? "corporation" : category;
  const educationLevel = normalizedCategory === "education" ? normalizeResourceEducationLevelFilter(filters.educationLevel) : "all";
  const resourcePage = await getResourceLibraryPage({ category: normalizedCategory, currentUserId: user.id, currentUserRole: user.role, educationLevel, page: Number.isInteger(filters.page) && filters.page > 0 ? filters.page : 1, pageSize: getResourceLibraryPageSize(normalizedCategory), query: filters.query.trim() });
  return { ok: true, data: { resourcePage } } as const;
}
export async function createResourceAction(_state: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  return saveResourceAction("create", undefined, formData);
}
export async function updateResourceAction(id: string, _state: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  return saveResourceAction("update", id, formData);
}
function parseUploadIds(formData: FormData): string[] {
  if (formData.has("uploadedAttachmentsJson")) throw new ResourceError("이전 첨부 정보는 사용할 수 없습니다. 파일을 다시 선택하세요.");
  const raw = formData.get("resourceUploadIds");
  if (raw === null || raw === "") return [];
  if (typeof raw !== "string" || raw.length > 65536) throw new ResourceError();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ResourceError(); }
  if (!Array.isArray(value)) throw new ResourceError();
  const ids = value.map(item => resourceId(item));
  if (new Set(ids).size !== ids.length) throw new ResourceError();
  return ids;
}
async function saveResourceAction(operation: "create" | "update", id: string | undefined, formData: FormData): Promise<ResourceFormState> {
  const user = await requireUser(), values = getResourceFormValues(formData);
  let uploadIds: string[] = [], requestId = "", expectedUpdatedAt: string | undefined;
  try {
    if (formData.get("expectedActorId") !== user.id) throw new ResourceError("로그인 계정이 변경되었습니다. 자료실을 다시 열어 주세요.", "FORBIDDEN", 403);
    requestId = resourceId(formData.get("requestId"), true);
    expectedUpdatedAt = operation === "update" ? resourceTimestamp(formData.get("expectedUpdatedAt")) : undefined;
    if (id !== undefined) resourceId(id);
    const errors = validateResourceFormValues(values);
    if (hasResourceFormErrors(errors)) throw new ResourceError("입력 내용을 확인해 주세요.", "VALIDATION_ERROR", 400, errors as Record<string, string>);
    uploadIds = parseUploadIds(formData);
    const files = formData.getAll("attachments").filter((file): file is File => typeof file !== "string" && file.size > 0);
    const context = { actorId: user.id, requestData: await getCurrentAuditLogRequestData(), strictRemoveIds: false };
    for (const [index, file] of files.entries()) {
      // The form attempt and logical slot remain stable across a lost response.
      const fileRequestId = createHash("sha256").update(JSON.stringify([requestId, id ?? null, index])).digest("hex");
      const prepared = await createResourceServerUpload(context, { requestId: fileRequestId, targetResourceId: id ?? null, file });
      if (!uploadIds.includes(prepared.upload.id)) uploadIds.push(prepared.upload.id);
      if (prepared.pending) throw new ResourceError("파일 검증 결과를 기다리고 있습니다. 원래 요청으로 다시 확인하세요.", "UPLOAD_PENDING", 409);
    }
    const data = { requestId, title: values.title, summary: values.summary, category: values.category, educationLevel: values.category === "education" ? values.educationLevel || null : null, uploadIds };
    const result = operation === "create"
      ? await mutateResource(context, { operation, data })
      : await mutateResource(context, { operation, resourceId: id!, data: { ...data, expectedUpdatedAt: expectedUpdatedAt!, removeAttachmentIds: formData.getAll("removeAttachmentIds").map(value => String(value).trim()).filter(Boolean) } });
    revalidateResourceLibrary(result.resourceId);
  } catch (error) {
    const known = error instanceof ResourceError;
    const rejected = known && ["VALIDATION_ERROR", "INVALID_REQUEST", "ATTACHMENT_POLICY"].includes(error.code) && formData.get("resourceAttemptWasUnknown") !== "true";
    return { values, errors: known && error.fields ? error.fields : { form: known ? error.message : "자료 저장 결과를 확인하지 못했습니다. 원래 내용으로 다시 시도하세요." }, requestId, expectedUpdatedAt, uploadIds,
      attemptDisposition: known && error.code === "RESOURCE_CONFLICT" ? "conflict" : known && [401,403,404].includes(error.status) ? "forbidden" : rejected ? "rejected" : "unknown" };
  }
  redirect(`/resources?category=${encodeURIComponent(values.category)}`);
}

export type ResourceDeleteState = { error?: string; conflict?: boolean; code?: string; status?: number };
export async function deleteResourceAction(_state: ResourceDeleteState, formData: FormData): Promise<ResourceDeleteState> {
  const user = await requireUser();
  let category = "corporation";
  try {
    if (formData.get("expectedActorId") !== user.id) throw new ResourceError("로그인 계정이 변경되었습니다. 자료실을 다시 열어 주세요.", "FORBIDDEN", 403);
    const id = resourceId(formData.get("resourceId")), requestId = resourceId(formData.get("requestId"), true), expectedUpdatedAt = resourceTimestamp(formData.get("expectedUpdatedAt"));
    const selected = normalizeResourceCategoryFilter(String(formData.get("category") ?? ""));
    category = selected === "all" ? "corporation" : selected;
    await mutateResource({ actorId: user.id, requestData: await getCurrentAuditLogRequestData() }, { operation: "delete", resourceId: id, data: { requestId, expectedUpdatedAt } });
    revalidateResourceLibrary(id);
  } catch (error) {
    return { error: error instanceof ResourceError ? error.message : "삭제 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.", conflict: error instanceof ResourceError && error.code === "RESOURCE_CONFLICT", code: error instanceof ResourceError ? error.code : "INTERNAL_ERROR", status: error instanceof ResourceError ? error.status : 500 };
  }
  redirect(`/resources?category=${encodeURIComponent(category)}`);
}
