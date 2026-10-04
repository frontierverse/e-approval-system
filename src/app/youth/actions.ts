"use server";

import { revalidatePath } from "next/cache";
import { randomUUID, createHash } from "node:crypto";
import { YouthError, parseYouthCreate, parseYouthPatch, parseYouthExtension, youthId, youthDate } from "@/lib/mobile-youth-core";
import { createMobileYouth, patchMobileYouth, extendMobileYouth, getYouthMutationStatus } from "@/lib/youth-mobile-mutations";
import { getWebYouthProfile, viewMobileYouth, youthDetails } from "@/lib/youth-mobile-queries";
import { withYouthRead, assertYouthPermission, lockOperationalYouth, youthPermissions, type YouthContext } from "@/lib/youth-mobile-context";
import { createYouthDecisionServerUpload } from "@/lib/youth-decision-uploads";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireAdmin } from "@/lib/auth";
import { deleteYouthDecisionDocument } from "@/lib/youth-decision-documents";
import { prisma } from "@/lib/prisma";
import { requireOperationalYouth } from "@/lib/youth-record-access";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
import { getYouthLearningScheduleToday } from "@/lib/youth-management-core";
import {
  isYouthNoteCategory,
  isYouthNotePriority,
  type YouthActionResult,
  type YouthCreateInput,
  type YouthDischargeExtension,
  type YouthDischargeExtensionInput,
  type YouthFamilyContact,
  youthDecisionDocumentFormFieldName,
  type YouthNoteInput,
  type YouthProfile,
  type YouthSpecialNote,
  type YouthUpdateInput,
} from "@/lib/youth-management-core";
import { mapYouthSpecialNote } from "@/lib/youth-management";
import {
  getYouthRosterChangeLogs,
  type YouthRosterChangeLogsResult,
} from "@/lib/youth-roster";
import {
  requireYouthBasicAccess,
  requireYouthPermission,
} from "@/lib/youth-permissions";
import {
  getEffectiveYouthPermissions,
} from "@/lib/youth-permissions-core";

export async function getYouthRosterChangeLogsAction(
  page: number,
): Promise<YouthActionResult<{ changeLogResult: YouthRosterChangeLogsResult }>> {
  const user = await requireYouthBasicAccess();
  const changeLogResult = await getYouthRosterChangeLogs({
    page,
    permissions: getEffectiveYouthPermissions(user),
  });

  return {
    ok: true,
    data: {
      changeLogResult,
    },
  };
}

function assertWebYouthActor(actorId: string, expected?: string) { if (expected !== undefined && expected !== actorId) throw new YouthError("계정이 변경되었습니다. 현재 계정에서 다시 시작해 주세요.", "FORBIDDEN", 403); }
function webYouthFailure(error: unknown) { return error instanceof YouthError ? { ok: false as const, error: error.message, code: error.code, status: error.status } : { ok: false as const, error: "요청 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", code: "REQUEST_UNAVAILABLE", status: 503 }; }
async function webYouthContext(actorId: string): Promise<YouthContext> { return { actorId, client: "web", requestData: await getCurrentAuditLogRequestData() }; }
async function prepareTrackedYouthDocuments(context: YouthContext, requestId: string, targetYouthId: string | null, formData?: FormData): Promise<string[]> {
  if (!formData) return [];
  if ([...formData.keys()].some(key => key !== youthDecisionDocumentFormFieldName)) throw new YouthError("첨부파일 입력 정보를 확인하세요.");
  const files = formData.getAll(youthDecisionDocumentFormFieldName).filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length > 5) throw new YouthError("새 결정문은 최대 5개까지 첨부할 수 있습니다.");
  const ids: string[] = [];
  for (const [index, file] of files.entries()) {
    const fileRequest = "web-file-" + createHash("sha256").update(requestId + ":" + index).digest("hex"), result = await createYouthDecisionServerUpload(context, { requestId: fileRequest, targetYouthId, file });
    if (result.pending || !["ready", "consumed"].includes(result.upload.state)) throw new YouthError("첨부파일을 확인 중입니다. 같은 요청으로 다시 확인해 주세요.", "REQUEST_UNAVAILABLE", 503);
    ids.push(result.upload.id);
  }
  return ids.sort();
}
async function webYouthAfterCommit(context: YouthContext, youthId: string, unavailable: boolean) {
  try { revalidateYouthPaths(); } catch { /* Business receipt already committed. */ }
  if (unavailable) return null;
  try { return await getWebYouthProfile(context, youthId); } catch { return null; /* Commit proof remains successful; no stale private data fallback. */ }
}
export async function recordYouthDetailViewAction(youthId: string): Promise<void> { const user = await requireYouthPermission("canViewYouthDetails"); await viewMobileYouth(await webYouthContext(user.id), youthId, "details", randomUUID()); }
export async function recordYouthContactViewAction(youthId: string): Promise<YouthActionResult<{ familyContacts: YouthFamilyContact[]; phone: string | null }>> { const user = await requireYouthPermission("canViewYouthContacts"); try { const view = await viewMobileYouth(await webYouthContext(user.id), youthId, "contacts", randomUUID()); if (!("contacts" in view)) throw new YouthError(); return { ok: true, data: view.contacts }; } catch (error) { return webYouthFailure(error); } }
export async function getYouthProfileMutationStatusAction(requestId: string): Promise<YouthActionResult<{ youth: YouthProfile | null; operation: string; targetId: string; outcome: string }>> { const user = await requireYouthPermission("canManageYouth"); try { const context = await webYouthContext(user.id), receipt = await getYouthMutationStatus(context, requestId); if (!["profile.create", "profile.patch", "profile.extend", "document.delete"].includes(receipt.operation)) throw new YouthError("요청의 작업 종류가 변경되었습니다.", "REQUEST_CONFLICT", 409); return { ok: true, data: { youth: await webYouthAfterCommit(context, receipt.operation === "document.delete" ? receipt.youthId! : receipt.targetId, receipt.operation === "document.delete" ? false : receipt.outcome !== "present"), operation: receipt.operation, targetId: receipt.targetId, outcome: receipt.outcome } }; } catch (error) { return webYouthFailure(error); } }
export async function createYouthAction(values: YouthCreateInput, documentsFormData?: FormData): Promise<YouthActionResult<{ youth: YouthProfile | null }>> {
  const user = await requireYouthPermission("canManageYouth");
  try { assertWebYouthActor(user.id, values.expectedActorId); const context = await webYouthContext(user.id), requestId = youthId(values.requestId ?? randomUUID(), true), parsed = parseYouthCreate({ requestId, name: values.name, admissionDate: values.admissionDate.trim(), dischargeDate: values.dischargeDate.trim(), birthDate: values.birthDate.trim(), phone: values.phone, familyContacts: values.familyContacts }), uploadIds = await prepareTrackedYouthDocuments(context, requestId, null, documentsFormData), result = await createMobileYouth(context, { ...parsed, uploadIds }); return { ok: true, data: { youth: await webYouthAfterCommit(context, result.targetId, result.outcome !== "present") } }; } catch (error) { return webYouthFailure(error); }
}
export async function updateYouthAction(youthId: string, values: YouthUpdateInput, documentsFormData?: FormData): Promise<YouthActionResult<{ youth: YouthProfile | null }>> {
  const user = await requireYouthPermission("canManageYouth");
  try { assertWebYouthActor(user.id, values.expectedActorId); const context = await webYouthContext(user.id), baseline = await withYouthRead(context, async (tx, actor, today) => { const youth = await lockOperationalYouth(tx, youthId, today); if (values.dischargeDate !== undefined) { const raw = await tx.youth.findUniqueOrThrow({ where: { id: youthId }, select: { initialDischargeDate: true } }); if (youthDate(values.dischargeDate.trim(), "dischargeDate") !== (raw.initialDischargeDate ?? youth.dischargeDate)) throw new YouthError("기본 퇴소 예정일은 퇴소 연장 기능으로만 변경할 수 있습니다."); } return { youth, permissions: youthPermissions(actor) }; }), requestId = youthIdValue(values.requestId), parsed = parseYouthPatch({ requestId, expectedUpdatedAt: values.expectedUpdatedAt ?? baseline.youth.updatedAt.toISOString(), patch: { name: values.name, admissionDate: values.admissionDate.trim(), ...(baseline.permissions.canViewYouthDetails && values.birthDate !== undefined ? { birthDate: values.birthDate.trim() } : {}), ...(baseline.permissions.canViewYouthContacts && values.phone !== undefined ? { phone: values.phone } : {}), ...(baseline.permissions.canViewYouthContacts && values.familyContacts !== undefined ? { familyContacts: values.familyContacts } : {}) } }), uploadIds = await prepareTrackedYouthDocuments(context, requestId, youthId, documentsFormData), result = await patchMobileYouth(context, youthId, { ...parsed, uploadIds }); return { ok: true, data: { youth: await webYouthAfterCommit(context, youthId, result.outcome !== "present") } }; } catch (error) { return webYouthFailure(error); }
}
function youthIdValue(value: string | undefined) { return youthId(value ?? randomUUID(), true); }
export async function getYouthProfileEditorAction(youthId: string): Promise<YouthActionResult<{ youth: YouthProfile }>> { const user = await requireYouthPermission("canManageYouth"); try { return { ok: true, data: { youth: await getWebYouthProfile(await webYouthContext(user.id), youthId) } }; } catch (error) { return webYouthFailure(error); } }
export async function extendYouthDischargeAction(youthId: string, values: YouthDischargeExtensionInput): Promise<YouthActionResult<{ dischargeDate: string; extension: YouthDischargeExtension | null; initialDischargeDate: string | null; updatedAt: string; youthId: string }>> {
  const user = await requireYouthPermission("canManageYouth");
  try {
    assertWebYouthActor(user.id, values.expectedActorId);
    const context = await webYouthContext(user.id), current = await withYouthRead(context, (tx, _actor, today) => lockOperationalYouth(tx, youthId, today));
    const parsed = parseYouthExtension({ requestId: youthIdValue(values.requestId), expectedUpdatedAt: values.expectedUpdatedAt ?? current.updatedAt.toISOString(), extendedDischargeDate: values.extendedDischargeDate.trim(), reason: values.reason });
    const result = await extendMobileYouth(context, youthId, parsed);
    const committed = { dischargeDate: result.result?.youth.dischargeDate ?? parsed.extendedDischargeDate, extension: null, initialDischargeDate: null, updatedAt: result.result?.youth.updatedAt ?? result.committedUpdatedAt!, youthId };
    try { revalidateYouthPaths(); } catch { /* Committed mutation remains successful. */ }
    try {
      return await withYouthRead(context, async (tx, actor, today) => {
        assertYouthPermission(actor, "canManageYouth");
        const parent = await lockOperationalYouth(tx, youthId, today), details = youthPermissions(actor).canViewYouthDetails ? await youthDetails(tx, youthId, today) : null;
        const receipt = details ? await tx.youthMutationReceipt.findUnique({ where: { actorId_requestId: { actorId: actor.id, requestId: parsed.requestId } }, select: { committedTargetsJson: true } }) : null;
        const proof = receipt?.committedTargetsJson, extensionId = proof && typeof proof === "object" && !Array.isArray(proof) && typeof proof.extensionId === "string" ? proof.extensionId : null;
        return { ok: true as const, data: { dischargeDate: parent.dischargeDate!, extension: details?.dischargeExtensions.find(extension => extension.id === extensionId) ?? null, initialDischargeDate: details?.initialDischargeDate ?? null, updatedAt: parent.updatedAt.toISOString(), youthId } };
      });
    } catch { return { ok: true, data: committed }; /* Post-commit failure cannot revoke the immutable receipt or reveal stale private data. */ }
  } catch (error) { return webYouthFailure(error); }
}

export async function deleteYouthAction(
  youthId: string,
): Promise<YouthActionResult<{ youthId: string }>> {
  await requireAdmin();
  void youthId;
  return { ok: false, error: "청소년 기록은 바로 삭제할 수 없습니다. 퇴소기록 관리에서 보존기간과 파기 대상을 검토하세요." };
}

export async function deleteYouthDecisionDocumentAction(documentId: string, baseline?: { requestId: string; youthId: string; expectedYouthUpdatedAt: string; expectedDocumentUpdatedAt: string; expectedActorId?: string }): Promise<YouthActionResult<{ documentId: string; updatedAt: string; youthId: string }>> {
  const user = await requireYouthPermission("canManageYouth");
  try {
    assertWebYouthActor(user.id, baseline?.expectedActorId);
    const context = await webYouthContext(user.id);
    const input = baseline ?? await withYouthRead(context, async (tx, actor, today) => {
      assertYouthPermission(actor, "canManageYouth");
      const document = await tx.youthDecisionDocument.findUnique({ where: { id: documentId }, select: { youthId: true, updatedAt: true } });
      if (!document) throw new YouthError("결정문을 찾을 수 없습니다.", "NOT_FOUND", 404);
      const parent = await lockOperationalYouth(tx, document.youthId, today);
      return { requestId: randomUUID(), youthId: document.youthId, expectedYouthUpdatedAt: parent.updatedAt.toISOString(), expectedDocumentUpdatedAt: document.updatedAt.toISOString() };
    });
    const { requestId, youthId, expectedYouthUpdatedAt, expectedDocumentUpdatedAt } = input;
    const receipt = await deleteYouthDecisionDocument(context, documentId, { requestId, youthId, expectedYouthUpdatedAt, expectedDocumentUpdatedAt });
    try { revalidateYouthPaths(); } catch { /* Durable receipt already committed. */ }
    return { ok: true, data: { documentId, youthId, updatedAt: receipt.committedUpdatedAt! } };
  } catch (error) { return webYouthFailure(error); }
}

export async function updateYouthNoteAction(
  noteId: string,
  values: YouthNoteInput,
): Promise<YouthActionResult<{ note: YouthSpecialNote }>> {
  const user = await requireYouthPermission("canManageYouth");
  const auditRequestData = await getCurrentAuditLogRequestData();

  const error = validateYouthNoteInput(values);

  if (error) {
    return {
      ok: false,
      error,
    };
  }

  const existing = await prisma.youthSpecialNote.findUnique({
    where: {
      id: noteId,
      youth: { is: youthOperationalWhere(getYouthLearningScheduleToday()) },
    },
    select: {
      id: true,
      title: true,
      youth: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "수정할 특이사항을 찾을 수 없습니다.",
    };
  }

  const note = await prisma.$transaction(async (tx) => {
    await requireOperationalYouth(existing.youth.id, tx);
    const updatedNote = await tx.youthSpecialNote.update({
      where: {
        id: noteId,
      },
      data: {
        title: values.title.trim(),
        summary: values.summary.trim(),
        detail: values.detail.trim(),
        category: values.category,
        recordedAt: values.recordedAt,
        author: values.author.trim(),
        priority: values.priority,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH_NOTE,
        targetType: "YouthSpecialNote",
        targetId: noteId,
        message: `${existing.youth.name} 청소년의 "${updatedNote.title}" 특이사항을 수정했습니다.`,
        metadata: {
          youthId: existing.youth.id,
          previousTitle: existing.title,
        },
      },
    });

    return updatedNote;
  });

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      note: mapYouthSpecialNote(note),
    },
  };
}

export async function deleteYouthNoteAction(
  noteId: string,
): Promise<YouthActionResult<{ noteId: string; youthId: string }>> {
  const user = await requireYouthPermission("canManageYouth");
  const auditRequestData = await getCurrentAuditLogRequestData();

  const note = await prisma.youthSpecialNote.findUnique({
    where: {
      id: noteId,
      youth: { is: youthOperationalWhere(getYouthLearningScheduleToday()) },
    },
    select: {
      id: true,
      title: true,
      youthId: true,
      youth: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!note) {
    return {
      ok: false,
      error: "삭제할 특이사항을 찾을 수 없습니다.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await requireOperationalYouth(note.youthId, tx);
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.DELETE_YOUTH_NOTE,
        targetType: "YouthSpecialNote",
        targetId: note.id,
        message: `${note.youth.name} 청소년의 "${note.title}" 특이사항을 삭제했습니다.`,
        metadata: {
          youthId: note.youthId,
        },
      },
    });

    await tx.youthSpecialNote.delete({
      where: {
        id: noteId,
      },
    });
  });

  revalidateYouthPaths();

  return {
    ok: true,
    data: {
      noteId: note.id,
      youthId: note.youthId,
    },
  };
}

function validateYouthNoteInput(values: YouthNoteInput) {
  if (!values.title.trim()) {
    return "특이사항 제목을 입력하세요.";
  }

  if (!values.summary.trim()) {
    return "요약을 입력하세요.";
  }

  if (!values.detail.trim()) {
    return "세부사항을 입력하세요.";
  }

  if (!isYouthNoteCategory(values.category)) {
    return "분류를 선택하세요.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.recordedAt)) {
    return "기록일을 선택하세요.";
  }

  if (!values.author.trim()) {
    return "기록자를 입력하세요.";
  }

  if (!isYouthNotePriority(values.priority)) {
    return "중요도를 선택하세요.";
  }

  return "";
}

function revalidateYouthPaths() {
  revalidatePath("/youth");
  revalidatePath("/youth/roster");
  revalidatePath("/youth/math-rewards");
  revalidatePath("/youth/learning-progress");
  revalidatePath("/work-schedule");
  revalidatePath("/work-schedule/work-log");
  revalidatePath("/company-info");
}
