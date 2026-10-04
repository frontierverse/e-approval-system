import "server-only";
import { randomUUID } from "node:crypto";
import { AuditAction, type Prisma } from "@/generated/prisma/client";
import { YouthError } from "@/lib/mobile-youth-core";
import { activityId, activityObject, activityToken, assertActivityVersion, nextActivityToken, parsePersonalInput, parseCommonBatch, personalQuery, type CommonBaseline } from "@/lib/youth-mobile-activity-core";
import { withYouthRead, withYouthMutation, lockOperationalYouth, mapYouthBasic, youthPermissions, type YouthContext } from "@/lib/youth-mobile-context";
import { getYouthPersonalScheduleCalendarDates, type NormalizedYouthPersonalScheduleInput } from "@/lib/youth-personal-schedule-core";
import { mapYouthPersonalSchedule, youthPersonalScheduleSelect } from "@/lib/youth-personal-schedules";

const personalSelect = { ...youthPersonalScheduleSelect, updatedAt: true } satisfies Prisma.YouthPersonalScheduleSelect;
type PersonalRecord = Prisma.YouthPersonalScheduleGetPayload<{ select: typeof personalSelect }>;
const commonSelect = { id: true, weekday: true, startHour: true, startMinute: true, endHour: true, endMinute: true, content: true, updatedAt: true } satisfies Prisma.YouthCommonScheduleSelect;
type CommonRecord = Prisma.YouthCommonScheduleGetPayload<{ select: typeof commonSelect }>;
export const mapMobilePersonal = (row: PersonalRecord) => ({ ...mapYouthPersonalSchedule(row), updatedAt: row.updatedAt.toISOString() });
export const mapMobileCommon = (row: CommonRecord) => ({ ...row, updatedAt: row.updatedAt.toISOString() });
const notFound = () => new YouthError("일정을 확인할 수 없습니다.", "NOT_FOUND", 404);
const employmentWhere = (date: string) => ({ AND: [{ OR: [{ hireDate: null }, { hireDate: "" }, { hireDate: { lte: date } }] }, { OR: [{ resignationDate: null }, { resignationDate: "" }, { resignationDate: { gte: date } }] }] });
async function staffOptions(tx: Prisma.TransactionClient, date: string, permitted: boolean) {
  return permitted ? tx.user.findMany({ where: employmentWhere(date), select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }) : [];
}
export async function getMobilePersonalSchedules(ctx: YouthContext, youthId: string, url: URL) {
  return withYouthRead(ctx, async (tx, actor, today) => {
    const youth = await lockOperationalYouth(tx, activityId(youthId), today), query = personalQuery(url, today), permissions = youthPermissions(actor);
    const rows = await tx.youthPersonalSchedule.findMany({ where: { youthId, occurrenceDates: { hasSome: getYouthPersonalScheduleCalendarDates(query.month) } }, select: personalSelect, orderBy: [{ startMinute: "asc" }, { id: "asc" }] });
    return { today, permissions, youth: mapYouthBasic(youth), ...query, schedules: rows.map(mapMobilePersonal), staffOptions: await staffOptions(tx, query.date, permissions.canManageYouth) };
  });
}
export async function getMobilePersonalSchedule(ctx: YouthContext, scheduleId: string) {
  return withYouthRead(ctx, async (tx, actor, today) => {
    const row = await tx.youthPersonalSchedule.findUnique({ where: { id: activityId(scheduleId) }, select: personalSelect });
    if (!row) throw notFound();
    const youth = await lockOperationalYouth(tx, row.youthId, today), permissions = youthPermissions(actor);
    return { today, permissions, youth: mapYouthBasic(youth), schedule: mapMobilePersonal(row), staffOptions: await staffOptions(tx, [...row.occurrenceDates].sort()[0] ?? today, permissions.canManageYouth) };
  });
}
async function escort(tx: Prisma.TransactionClient, input: NormalizedYouthPersonalScheduleInput, previous?: PersonalRecord) {
  if (input.scheduleType !== "HOSPITAL") return { escortUserId: null, escortName: null };
  if (input.escortType === "OTHER") return { escortUserId: null, escortName: input.escortOtherName };
  const staff = await tx.user.findFirst({ where: { id: input.escortUserId!, ...employmentWhere(input.occurrenceDates[0]) }, select: { id: true, name: true } });
  if (!staff) throw new YouthError("방문일에 재직하는 동행 직원을 다시 선택하세요.", "VALIDATION_ERROR", 400, { input: "동행 직원을 확인하세요." });
  return { escortUserId: staff.id, escortName: previous?.escortType === "STAFF" && previous.escortUserId === staff.id && previous.escortName?.trim() ? previous.escortName : staff.name };
}
async function assertNoOverlap(tx: Prisma.TransactionClient, youthId: string, input: NormalizedYouthPersonalScheduleInput, except?: string) {
  const conflict = await tx.youthPersonalSchedule.findFirst({ where: { youthId, ...(except ? { id: { not: except } } : {}), occurrenceDates: { hasSome: input.occurrenceDates }, startMinute: { lt: input.endMinute }, endMinute: { gt: input.startMinute } }, select: { id: true } });
  if (conflict) throw new YouthError("선택한 날짜와 시간에 다른 개인 일정이 있습니다.", "SCHEDULE_CONFLICT", 409);
}
const personalData = (input: NormalizedYouthPersonalScheduleInput) => ({ content: input.content, startMinute: input.startMinute, endMinute: input.endMinute, selectionMode: input.selectionMode, occurrenceDates: input.occurrenceDates, recurrenceWeekdays: input.recurrenceWeekdays, recurrenceStartDate: input.recurrenceStartDate, recurrenceEndDate: input.recurrenceEndDate, scheduleType: input.scheduleType, hospitalName: input.hospitalName, escortType: input.escortType, nextAppointmentDate: input.nextAppointmentDate });
async function personalAudit(tx: Prisma.TransactionClient, ctx: YouthContext, actorId: string, youth: { id: string; name: string }, type: "create" | "update" | "delete", previous: PersonalRecord | null, next: PersonalRecord | null) {
  await tx.auditLog.create({ data: { ...ctx.requestData, actorId, action: AuditAction.UPDATE_YOUTH, targetType: "YouthPersonalSchedule", targetId: (next ?? previous)!.id, message: `${youth.name} 청소년의 개인 일정을 ${type === "create" ? "등록" : type === "update" ? "수정" : "삭제"}했습니다.`, metadata: { source: "youth-personal-schedule", changeType: `youthPersonalSchedule.${type}`, youthId: youth.id, youthName: youth.name, previous: previous ? mapMobilePersonal(previous) : null, next: next ? mapMobilePersonal(next) : null } } });
}
async function personalReplay(tx: Prisma.TransactionClient, youthId: string, id: string, today: string) {
  const row = await tx.youthPersonalSchedule.findUnique({ where: { id }, select: personalSelect });
  return row?.youthId === youthId ? { youth: mapYouthBasic(await lockOperationalYouth(tx, youthId, today)), schedule: mapMobilePersonal(row) } : null;
}
export async function createMobilePersonalSchedule(ctx: YouthContext, youthId: string, raw: unknown) {
  const body = activityObject(raw, ["requestId", "input"]), requestId = activityId(body.requestId, true), input = parsePersonalInput(body.input);
  return withYouthMutation(ctx, { operation: "personal.create", requestId, payload: input, youthId: activityId(youthId), targetType: "YouthPersonalSchedule", replay: (tx, _actor, today, _now, receipt) => personalReplay(tx, youthId, receipt.targetId, today) }, async (tx, actor, today, now) => {
    const youth = await lockOperationalYouth(tx, youthId, today), snapshot = await escort(tx, input);
    await assertNoOverlap(tx, youthId, input);
    const row = await tx.youthPersonalSchedule.create({ data: { id: randomUUID(), youthId, ...personalData(input), ...snapshot, updatedAt: now }, select: personalSelect });
    await personalAudit(tx, ctx, actor.id, youth, "create", null, row);
    return { targetId: row.id, committedUpdatedAt: row.updatedAt, result: { youth: mapYouthBasic(youth), schedule: mapMobilePersonal(row) } };
  });
}
export async function updateMobilePersonalSchedule(ctx: YouthContext, id: string, raw: unknown, legacy = false) {
  const body = activityObject(raw, ["requestId", "youthId", "expectedUpdatedAt", "input"]), requestId = activityId(body.requestId, true), youthId = activityId(body.youthId), expected = legacy && body.expectedUpdatedAt === undefined ? undefined : activityToken(body.expectedUpdatedAt), input = parsePersonalInput(body.input);
  return withYouthMutation(ctx, { operation: "personal.update", requestId, payload: { expectedUpdatedAt: expected ?? null, input }, youthId, targetType: "YouthPersonalSchedule", targetId: activityId(id), replay: (tx, _actor, today) => personalReplay(tx, youthId, id, today) }, async (tx, actor, today, now) => {
    await tx.$queryRaw`SELECT "id" FROM "YouthPersonalSchedule" WHERE "id" = ${id} FOR UPDATE`;
    const previous = await tx.youthPersonalSchedule.findUnique({ where: { id }, select: personalSelect });
    if (!previous || previous.youthId !== youthId) throw notFound();
    assertActivityVersion(previous.updatedAt, expected);
    if (previous.scheduleType === "HOSPITAL" && !Object.hasOwn(body.input as object, "scheduleType")) throw new YouthError("병원 일정의 종류를 다시 확인하세요.", "INVALID_REQUEST", 400);
    const youth = await lockOperationalYouth(tx, youthId, today), snapshot = await escort(tx, input, previous);
    await assertNoOverlap(tx, youthId, input, id);
    const row = await tx.youthPersonalSchedule.update({ where: { id }, data: { ...personalData(input), ...snapshot, updatedAt: nextActivityToken(now, previous.updatedAt) }, select: personalSelect });
    await personalAudit(tx, ctx, actor.id, youth, "update", previous, row);
    return { targetId: id, committedUpdatedAt: row.updatedAt, result: { youth: mapYouthBasic(youth), schedule: mapMobilePersonal(row) } };
  });
}
export async function deleteMobilePersonalSchedule(ctx: YouthContext, id: string, raw: unknown, legacy = false) {
  const body = activityObject(raw, ["requestId", "youthId", "expectedUpdatedAt"]), requestId = activityId(body.requestId, true), youthId = activityId(body.youthId), expected = legacy && body.expectedUpdatedAt === undefined ? undefined : activityToken(body.expectedUpdatedAt);
  return withYouthMutation(ctx, { operation: "personal.delete", requestId, payload: { expectedUpdatedAt: expected ?? null }, youthId, targetType: "YouthPersonalSchedule", targetId: activityId(id), replay: async (tx, _actor, today) => ({ youth: mapYouthBasic(await lockOperationalYouth(tx, youthId, today)), scheduleId: id }) }, async (tx, actor, today) => {
    await tx.$queryRaw`SELECT "id" FROM "YouthPersonalSchedule" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.youthPersonalSchedule.findUnique({ where: { id }, select: personalSelect });
    if (!row || row.youthId !== youthId) throw notFound();
    assertActivityVersion(row.updatedAt, expected);
    const youth = await lockOperationalYouth(tx, youthId, today);
    await tx.youthPersonalSchedule.delete({ where: { id } });
    await personalAudit(tx, ctx, actor.id, youth, "delete", row, null);
    return { targetId: id, committedUpdatedAt: row.updatedAt, result: { youth: mapYouthBasic(youth), scheduleId: id } };
  });
}
export async function getMobileCommonSchedules(ctx: YouthContext, weekday: number) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 5) throw new YouthError("요일을 확인하세요.", "INVALID_REQUEST", 400);
  return withYouthRead(ctx, async (tx, actor, today) => ({ today, permissions: youthPermissions(actor), weekday, items: (await tx.youthCommonSchedule.findMany({ where: { weekday }, select: commonSelect, orderBy: [{ startMinute: "asc" }, { id: "asc" }] })).map(mapMobileCommon) }));
}
type CommonBatch = ReturnType<typeof parseCommonBatch>;
export async function mutateMobileCommonSchedules(ctx: YouthContext, raw: unknown) { return commonMutation(ctx, parseCommonBatch(raw)); }
// Legacy callers may omit a baseline; only this server-owned wrapper resolves it under the same locks.
export async function mutateWebCommonSchedules(ctx: YouthContext, raw: Omit<CommonBatch, "baselines"> & { baselines?: CommonBaseline[]; sourceStartMinute: number }) {
  const parsed = parseCommonBatch({ ...("startMinute" in raw ? { startMinute: raw.startMinute, endMinute: raw.endMinute, content: raw.content } : {}), requestId: raw.requestId, operation: raw.operation, targetWeekdays: raw.targetWeekdays, baselines: raw.baselines ?? raw.targetWeekdays.map(weekday => ({ weekday, startMinute: raw.sourceStartMinute, scheduleId: null, expectedUpdatedAt: null })) });
  return commonMutation(ctx, parsed, !raw.baselines);
}
async function commonMutation(ctx: YouthContext, batch: CommonBatch, resolveLegacy = false) {
  return withYouthMutation(ctx, { operation: "common.batch", requestId: batch.requestId, targetType: "YouthCommonScheduleBatch", payload: { ...batch, requestId: undefined, ...(resolveLegacy ? { legacyBaseline: true } : {}) }, replay: async (tx, _actor, _today, _now, receipt) => {
    // Receipt targets are IDs, never coordinates: a deleted/recreated row is not attributed to this request.
    return { items: (await tx.youthCommonSchedule.findMany({ where: { id: { in: Array.isArray(receipt.committedTargetsJson) ? receipt.committedTargetsJson.flatMap(value => value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && value.deleted === false ? [value.id] : []) : [] } }, select: commonSelect, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] })).map(mapMobileCommon), targetWeekdays: batch.targetWeekdays };
  } }, async (tx, actor, _today, now, receiptId) => {
    for (const weekday of batch.targetWeekdays) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('youth-common-weekday'), ${weekday})`;
    const rows = await tx.youthCommonSchedule.findMany({ where: { weekday: { in: batch.targetWeekdays } }, select: commonSelect });
    const sources = batch.baselines.map(baseline => {
      const row = rows.find(item => item.weekday === baseline.weekday && item.startMinute === baseline.startMinute);
      if (!resolveLegacy && (row?.id !== (baseline.scheduleId ?? undefined) || (row && row.updatedAt.toISOString() !== baseline.expectedUpdatedAt))) throw new YouthError("공통 일정이 변경되었습니다. 최신 목록을 확인하세요.", "YOUTH_CONFLICT", 409);
      return { baseline, row };
    });
    if (batch.operation === "save") for (const { baseline, row } of sources) if (rows.some(other => other.weekday === baseline.weekday && other.id !== row?.id && other.startMinute < batch.endMinute && other.endMinute > batch.startMinute)) throw new YouthError("선택한 요일과 시간에 다른 공통 일정이 있습니다.", "SCHEDULE_CONFLICT", 409);
    const changed: CommonRecord[] = [], committedTargets: Array<{ id: string; updatedAt: string; deleted: boolean }> = [];
    for (const { baseline, row } of sources) {
      if (batch.operation === "delete") {
        if (!row) continue;
        await tx.youthCommonSchedule.delete({ where: { id: row.id } });
        committedTargets.push({ id: row.id, updatedAt: row.updatedAt.toISOString(), deleted: true });
        await commonAudit(tx, ctx, actor.id, "delete", row, null, batch.targetWeekdays, baseline.startMinute);
        continue;
      }
      if (row && row.startMinute === batch.startMinute && row.endMinute === batch.endMinute && row.content === batch.content) { changed.push(row); committedTargets.push({ id: row.id, updatedAt: row.updatedAt.toISOString(), deleted: false }); continue; }
      const data = { weekday: baseline.weekday, startMinute: batch.startMinute, endMinute: batch.endMinute, startHour: Math.floor(batch.startMinute / 60), endHour: Math.ceil(batch.endMinute / 60), content: batch.content, updatedAt: row ? nextActivityToken(now, row.updatedAt) : now };
      const next = row ? await tx.youthCommonSchedule.update({ where: { id: row.id }, data, select: commonSelect }) : await tx.youthCommonSchedule.create({ data: { id: randomUUID(), ...data }, select: commonSelect });
      changed.push(next); committedTargets.push({ id: next.id, updatedAt: next.updatedAt.toISOString(), deleted: false });
      await commonAudit(tx, ctx, actor.id, row ? "update" : "create", row ?? null, next, batch.targetWeekdays, baseline.startMinute);
    }
    return { targetId: receiptId, committedTargets, result: { items: changed.map(mapMobileCommon), targetWeekdays: batch.targetWeekdays } };
  });
}
async function commonAudit(tx: Prisma.TransactionClient, ctx: YouthContext, actorId: string, type: string, previous: CommonRecord | null, next: CommonRecord | null, targetWeekdays: number[], sourceStartMinute: number) {
  const row = (next ?? previous)!;
  await tx.auditLog.create({ data: { ...ctx.requestData, actorId, action: AuditAction.UPDATE_YOUTH, targetType: "YouthCommonSchedule", targetId: row.id, message: `공통 일정을 ${type === "create" ? "등록" : type === "update" ? "수정" : "삭제"}했습니다.`, metadata: { source: "youth-common-schedule", changeType: `commonSchedule.${type}`, weekday: row.weekday, sourceStartMinute, targetWeekdays, previousContent: previous?.content ?? null, nextContent: next?.content ?? null, previousStartMinute: previous?.startMinute ?? null, previousEndMinute: previous?.endMinute ?? null, nextStartMinute: next?.startMinute ?? null, nextEndMinute: next?.endMinute ?? null } } });
}
