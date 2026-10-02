import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import ts from "typescript";
import { getYouthRetentionState, getYouthRetentionUntil, isRestrictedYouth, validateRetentionInput } from "../src/lib/youth-retention-core.ts";

// Execute the real service, DTO mapper, access guards and download route in an isolated store.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const h: Row = { admin: true, failAudit: false, failStorage: false, removed: [], youths: [], reports: [], audits: [], links: {} };
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (key === "AND") return value.every((part: Row) => matches(row, part));
    if (key === "youth") return matches(h.youths.find((y: Row) => y.id === row.youthId), value.is);
    if (value === null || typeof value !== "object") return row[key] === value;
    if ("not" in value) return row[key] !== value.not;
    if ("in" in value) return value.in.includes(row[key]);
    if ("gte" in value) return row[key] !== null && row[key] >= value.gte;
    return true;
  });
}
function update(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value;
}
const db: Row = {
  youth: {
    async findUnique({ where }: Row) { const row = h.youths.find((row: Row) => matches(row, where)); return row ? structuredClone(row) : null; },
    async findMany({ where }: Row) { return h.youths.filter((row: Row) => matches(row, where)).map((row: Row) => structuredClone(row)); },
    async updateMany({ where, data }: Row) { const rows = h.youths.filter((row: Row) => matches(row, where)); rows.forEach((row: Row) => update(row, data)); return { count: rows.length }; },
  },
  auditLog: { async create({ data }: Row) { if (h.failAudit) throw new Error("Audit unavailable"); h.audits.push(data); } },
  youthDecisionDocument: { async findUnique({ where }: Row) { return h.links.youthDecisionDocument.find((r: Row) => matches(r, where)) ?? null; } },
  dailyWorkReport: {
    async findMany({ where }: Row) { return h.reports.filter((r: Row) => matches(r, where)); },
    async update({ where, data }: Row) { update(h.reports.find((r: Row) => r.id === where.id), data); },
  },
  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join("?");
    if (sql.includes('FROM "Youth"')) { assert.match(sql, /FOR UPDATE/); h.locks.push(values[0]); return h.youths.filter((r: Row) => r.id === values[0]); }
    assert.match(sql, /jsonb_array_elements/); assert.match(sql, /FOR UPDATE/);
    return h.reports.filter((r: Row) => r.youthReports.some((entry: Row) => entry.youthId === values[0]));
  },
  async $executeRaw(strings: TemplateStringsArray, ids: string[], quotedId: string) {
    const sql = strings.join("?"); assert.match(sql, /UPDATE "AuditLog"/); assert.match(sql, /ANY\(\?::text\[\]\)/);
    for (const audit of h.audits) if (ids.includes(audit.targetId) || JSON.stringify(audit.metadata).includes(quotedId)) { audit.message = "개인정보 파기"; audit.metadata = { personalDataPurged: true }; }
  },
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    const snapshot = structuredClone({ youths: h.youths, links: h.links, reports: h.reports, audits: h.audits });
    try { return await operation(Object.create(db)); } catch (error) { Object.assign(h, snapshot); throw error; }
  },
};
const childTables = ["youthDecisionDocument", "youthFamilyContact", "youthSpecialNote", "youthDischargeExtension", "youthAcademySchedule", "youthPersonalSchedule", "youthLearningSchedule", "studyConceptCheck", "youthRule"];
for (const table of childTables) db[table] = { ...db[table], async deleteMany({ where }: Row) { h.links[table] = h.links[table].filter((row: Row) => !matches(row, where)); } };
for (const table of ["mathResult", "mathVaultLog"]) db[table] = { async updateMany({ where, data }: Row) { for (const row of h.links[table].filter((r: Row) => matches(r, where))) update(row, data); } };
(globalThis as Row).__retentionHarness = { h, db };
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mocks = moduleUrl(`const {h, db} = globalThis.__retentionHarness;
  export const prisma = db;
  export async function requireAdmin() { if (!h.admin) throw new Error("Forbidden"); return {id:"admin",role:"ADMIN"}; }
  export async function getCurrentUser() { return {id:"reader",role:h.admin?"ADMIN":"USER",status:"ACTIVE",canDownloadYouthDocuments:true}; }
  export async function getCurrentAuditLogRequestData() { return {}; }
  export async function removeStoredAttachmentFiles(files) { if (h.failStorage) throw new Error("Storage unavailable"); h.removed.push(...files); }
  export async function readStoredAttachmentFile() { return {body:new Uint8Array([1,2,3]),size:3,mimeType:"application/pdf"}; }
`);
const aliases = { "@/lib/prisma": mocks, "@/lib/auth": mocks, "@/lib/attachment-storage": mocks, "@/lib/audit-log-request": mocks };
function compile(file: string, replacements: Row) {
  let source = readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const mapper = compile("../src/lib/youth-management.ts", aliases);
const service = await import(compile("../src/lib/youth-retention.ts", { ...aliases, "@/lib/youth-management": mapper }));
const access = await import(compile("../src/lib/youth-record-access.ts", aliases));
const route = await import(compile("../src/app/youth/decision-documents/[id]/route.ts", aliases));
function record(id = "youth-1"): Row {
  return { id, name: id === "youth-1" ? "청소년가" : "청소년나", admissionDate: "2020-01-01", birthDate: "2005-02-03", age: null,
    initialDischargeDate: "2020-06-01", dischargeDate: "2020-06-01", actualDischargeDate: "2020-06-01", caseClosedDate: "2020-07-01", retentionUntil: "2025-07-01", retentionBasis: "기준", retentionHoldReason: null,
    phone: "010-1234-5678", familyPhone: "가족 전화", familyContact: "부", familyRelationship: "부", retentionVersion: 0, purgeStartedAt: null, purgeLeaseUntil: null, purgedAt: null, updatedAt: new Date(),
    familyContacts: [{ id: `family-${id}`, relationship: "부", phone: "가족 전화" }], decisionDocuments: [{ id: `doc-${id}`, originalName: "결정문.pdf", storageKey: `file-${id}`, storageProvider: "LOCAL", createdAt: new Date(), size: 3 }],
    notes: [{ id: `note-${id}`, title: "개인 기록", detail: "민감정보", summary: "요약", category: "GENERAL", priority: "NORMAL", recordedAt: "2020-06-01", createdAt: new Date(), updatedAt: new Date() }],
    rules: [], personalSchedules: [], learningSchedules: [], academySchedules: [], dischargeExtensions: [],
    mathSettlement: { amount: 3000, passCount: 3, reopenedAt: null }, _count: { decisionDocuments: 1, mathResults: 1 },
  };
}
const input = () => ({ version: h.youths[0].retentionVersion, confirmationName: "청소년가", reviewedCopies: true });
beforeEach(() => {
  Object.assign(h, { admin: true, failAudit: false, failStorage: false, removed: [], locks: [], youths: [record(), record("youth-2")], audits: [{ targetType: "Youth", targetId: "youth-1", message: "청소년가 전화", metadata: { phone: "010" } }] });
  for (const table of childTables) h.links[table] = ["youth-1", "youth-2"].map(youthId => ({ id: `${table}-${youthId}`, youthId, targetYouthId: youthId }));
  h.links.youthDecisionDocument = h.youths.flatMap((y: Row) => y.decisionDocuments.map((d: Row) => ({ ...d, youthId: y.id, youth: y })));
  for (const table of ["mathResult", "mathVaultLog"]) h.links[table] = [{ studentId: "youth-1", amount: 3000, memo: "청소년가 이름" }, { studentId: "youth-2", amount: 7000, memo: "다른 청소년" }];
  h.reports = [{ id: "report", version: 1, submittedAt: new Date(), workDate: new Date("2020-06-01"), author: { name: "직원" }, mainContent: "별도 검토 본문", youthReports: [{ youthId: "youth-1", youthName: "청소년가", content: "대상 민감정보" }, { youthId: "youth-2", youthName: "청소년나", content: "다른 기록" }] },
    { id: "draft", version: 1, submittedAt: null, workDate: new Date(), author: { name: "직원" }, youthReports: [{ youthId: "youth-1", youthName: "청소년가", content: "비공개 초안" }] }];
});

test("five calendar years, leap days and the last retention day are safe", () => {
  assert.equal(getYouthRetentionUntil("2020-02-29"), "2025-02-28");
  assert.equal(getYouthRetentionUntil("2021-12-31"), "2026-12-31");
  assert.throws(() => getYouthRetentionUntil("2020-02-30"));
  assert.equal(getYouthRetentionState(record(), "2025-07-01"), "retained");
  assert.equal(getYouthRetentionState(record(), "2025-07-02"), "due");
  assert.ok(isRestrictedYouth({ dischargeDate: "2020-06-01" }, "2026-10-01"));
  assert.equal(isRestrictedYouth({ dischargeDate: "2026-10-01" }, "2026-10-01"), false);
});

test("actual discharge cannot be inferred, undone, backdated before admission or shortened", async () => {
  const row = record(); const values = { version: 0, actualDischargeDate: "2020-06-01", caseClosedDate: "2020-07-01", holdReason: "" };
  for (const change of [{ actualDischargeDate: "2030-01-01" }, { actualDischargeDate: "2019-01-01" }, { caseClosedDate: "" }, { caseClosedDate: "2020-06-30" }, { caseClosedDate: "2020-02-30" }]) assert.ok(validateRetentionInput({ ...values, ...change }, row, "2026-10-01"));
  await service.saveYouthRetention("youth-1", { ...values, holdReason: "법원 요청 검토" });
  assert.equal(h.youths[0].retentionHoldReason, "법원 요청 검토"); assert.equal(h.youths[0].retentionVersion, 1);
  await assert.rejects(service.saveYouthRetention("youth-1", values), /다른 관리자/);
  h.failAudit = true;
  await assert.rejects(service.saveYouthRetention("youth-1", { ...values, version: 1, holdReason: "새 내용" }), /Audit/);
  assert.equal(h.youths[0].retentionHoldReason, "법원 요청 검토");
});

test("an incorrect expired plan can be corrected without confirming actual discharge", async () => {
  h.youths[0].actualDischargeDate = null; h.youths[0].caseClosedDate = null; h.youths[0].retentionUntil = null;
  const values = { version: 0, actualDischargeDate: "", caseClosedDate: "", holdReason: "", correctedDischargeDate: "2099-10-01" };
  await assert.rejects(service.saveYouthRetention("youth-1", values), /정산 해제/);
  h.youths[0].mathSettlement.reopenedAt = new Date();
  await service.saveYouthRetention("youth-1", values);
  assert.equal(h.youths[0].dischargeDate, "2099-10-01"); assert.equal(h.youths[0].actualDischargeDate, null);
  assert.equal(h.youths[0].retentionUntil, null); await access.requireOperationalYouth("youth-1");
  h.youths[0].actualDischargeDate = "2020-06-01";
  await assert.rejects(service.saveYouthRetention("youth-1", { ...values, version: 1 }), /예정일만/);
});

test("transactional access locks the youth row and separates aftercare from normal writes", async () => {
  await db.$transaction((tx: Row) => access.requireYouthNotPurging("youth-1", tx));
  assert.deepEqual(h.locks, ["youth-1"]);
  await assert.rejects(db.$transaction((tx: Row) => access.requireOperationalYouth("youth-1", tx)), /퇴소 기록/);
  h.youths[0].purgedAt = new Date();
  await assert.rejects(db.$transaction((tx: Row) => access.requireYouthNotPurging("youth-1", tx)), /파기/);
});

test("purge refuses unconfirmed discharge, aftercare, holds, unexpired dates and open settlements", async () => {
  for (const change of [{ actualDischargeDate: null }, { caseClosedDate: null }, { retentionHoldReason: "법원 요청" }, { retentionUntil: "2099-01-01" }, { mathSettlement: null }, { mathSettlement: { reopenedAt: new Date() } }, { purgeLeaseUntil: new Date(Date.now() + 60_000) }]) {
    h.youths[0] = { ...record(), ...change };
    await assert.rejects(service.purgeYouthRecord("youth-1", input()));
    assert.equal(h.removed.length, 0); assert.equal(h.youths[0].purgedAt, null);
  }
  h.youths[0] = record();
  await assert.rejects(service.purgeYouthRecord("youth-1", { ...input(), confirmationName: "다른 이름" }));
  await assert.rejects(service.purgeYouthRecord("youth-1", { ...input(), reviewedCopies: false }));
  h.admin = false;
  await assert.rejects(service.purgeYouthRecord("youth-1", input()), /Forbidden/);
  await assert.rejects(service.readRetainedYouth("youth-1", "AFTERCARE"), /Forbidden/);
  await assert.rejects(service.getYouthRetentionRecords(), /Forbidden/);
});

test("retained read is audited, restricted to the target, and excludes private drafts", async () => {
  const detail = await service.readRetainedYouth("youth-1", "RETENTION_REVIEW");
  assert.equal(detail.phone, "010-1234-5678"); assert.equal(detail.retainedReports.length, 1);
  assert.equal(detail.retainedReports[0].content, "대상 민감정보");
  assert.ok(!JSON.stringify(detail).includes("비공개 초안")); assert.ok(!JSON.stringify(detail).includes("다른 기록"));
  assert.equal(h.audits.at(-1).metadata.reason, "RETENTION_REVIEW");
  await assert.rejects(service.readRetainedYouth("youth-1", "INVALID"));
  h.failAudit = true; await assert.rejects(service.readRetainedYouth("youth-1", "AFTERCARE"), /Audit/);
});

test("failed file deletion keeps references, locks normal writes, and retries safely", async () => {
  const errorLog = console.error; console.error = () => {};
  try {
    h.failStorage = true; await assert.rejects(service.purgeYouthRecord("youth-1", input()), /다시 실행/);
    assert.equal(h.youths[0].name, "청소년가"); assert.equal(h.youths[0].purgedAt, null);
    assert.ok(h.youths[0].purgeStartedAt); assert.equal(h.youths[0].purgeLeaseUntil, null);
    assert.equal(h.links.youthDecisionDocument.length, 2);
    await assert.rejects(access.requireOperationalYouth("youth-1"), /파기/);
    await assert.rejects(access.requireYouthNotPurging("youth-1"), /파기/);
    await assert.rejects(service.readRetainedYouth("youth-1", "AFTERCARE"));
    h.failStorage = false; await service.purgeYouthRecord("youth-1", input());
    assert.ok(h.youths[0].purgedAt); assert.equal(h.removed.length, 1);
    await assert.rejects(service.purgeYouthRecord("youth-1", input()));
  } finally { console.error = errorLog; }
});

test("successful purge scrubs connected records and reports, keeps unrelated records and amounts", async () => {
  await service.purgeYouthRecord("youth-1", input());
  for (const key of ["phone", "birthDate", "age", "familyPhone", "familyContact", "admissionDate", "dischargeDate", "caseClosedDate", "retentionHoldReason"]) assert.equal(h.youths[0][key], null);
  assert.equal(h.youths[0].name, "파기된 기록 youth-1"); assert.equal(h.youths[1].name, "청소년나");
  for (const table of childTables) assert.equal(h.links[table].length, 1, table);
  assert.deepEqual(h.reports[0].youthReports, [{ youthId: "youth-2", youthName: "청소년나", content: "다른 기록" }]);
  assert.equal(h.reports[0].version, 2); assert.deepEqual(h.reports[1].youthReports, []);
  assert.equal(h.reports[0].mainContent, "별도 검토 본문");
  for (const table of ["mathResult", "mathVaultLog"]) { assert.equal(h.links[table][0].amount, 3000); assert.equal(h.links[table][0].memo, null); assert.equal(h.links[table][1].memo, "다른 청소년"); }
  assert.equal(h.audits[0].metadata.personalDataPurged, true);
  assert.equal(h.audits.at(-1).metadata.changeType, "youth.retention.purged");
});

test("decision download denies discharged staff access and fails closed when auditing fails", async () => {
  const request = () => { const data = new FormData(); data.set("reason", "INTERNAL_REVIEW"); return new Request("http://localhost/youth/decision-documents/doc-youth-1", { method: "POST", body: data }); };
  const context = { params: Promise.resolve({ id: "doc-youth-1" }) };
  h.admin = false; assert.equal((await route.POST(request(), context)).status, 403);
  h.admin = true; const result = await route.POST(request(), context); assert.equal(result.status, 200); assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  h.failAudit = true;
  const errorLog = console.error; console.error = () => {};
  try { assert.equal((await route.POST(request(), context)).status, 503); } finally { console.error = errorLog; }
});
