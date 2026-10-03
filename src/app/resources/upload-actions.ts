"use server";

import { getCurrentUser } from "@/lib/auth";
import { ResourceError, parseResourceUpload, resourceId, resourceInputObject } from "@/lib/mobile-resources-core";
import { getResourceEditor } from "@/lib/resource-library-queries";
import { getResourceMutationStatus } from "@/lib/resource-library-mutations";
import { cancelResourceUpload, completeResourceUpload, getResourceUploadStatus, grantResourceUpload, startResourceUpload } from "@/lib/resource-uploads";

export type ResourceWebActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string; status: number };
async function result<T>(expectedActorId: unknown, run: (actorId: string) => Promise<T>): Promise<ResourceWebActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다.", code: "UNAUTHORIZED", status: 401 };
  if (expectedActorId !== user.id) return { ok: false, error: "로그인 계정이 변경되었습니다. 자료실을 다시 열어 주세요.", code: "FORBIDDEN", status: 403 };
  try { return { ok: true, data: await run(user.id) }; }
  catch (error) {
    if (error instanceof ResourceError) return { ok: false, error: error.message, code: error.code, status: error.status };
    return { ok: false, error: "자료실 요청 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도하세요.", code: "INTERNAL_ERROR", status: 500 };
  }
}
export async function startResourceUploadAction(input: unknown, expectedActorId: unknown) {
  return result(expectedActorId, actorId => startResourceUpload({ actorId }, parseResourceUpload(input)));
}
export async function getResourceUploadStatusAction(input: unknown, expectedActorId: unknown) {
  return result(expectedActorId, actorId => {
    const object = resourceInputObject(input, [], ["id", "requestId"]);
    if (Object.keys(object).length !== 1) throw new ResourceError();
    return getResourceUploadStatus({ actorId }, "id" in object ? { id: resourceId(object.id) } : { requestId: resourceId(object.requestId, true) });
  });
}
export async function grantResourceUploadAction(id: unknown, expectedActorId: unknown) {
  return result(expectedActorId, actorId => grantResourceUpload({ actorId }, resourceId(id)));
}
export async function completeResourceUploadAction(id: unknown, expectedActorId: unknown) {
  return result(expectedActorId, actorId => completeResourceUpload({ actorId }, resourceId(id)));
}
export async function cancelResourceUploadAction(id: unknown, expectedActorId: unknown) {
  return result(expectedActorId, actorId => cancelResourceUpload({ actorId }, resourceId(id)));
}
export async function getResourceMutationStatusAction(requestId: unknown, expectedActorId: unknown) {
  return result(expectedActorId, actorId => getResourceMutationStatus({ actorId }, resourceId(requestId, true)));
}
export async function getResourceEditorAction(id: unknown, expectedActorId: unknown) {
  return result(expectedActorId, actorId => getResourceEditor({ actorId }, resourceId(id)));
}
