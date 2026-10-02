import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { mobileDocumentOrderBy, mobileDocumentWhere, parseMobileDocumentFilters } from "../src/lib/mobile-document-library-core.ts";
import { documentLibraryPath, documentPeriodError, formatDocumentDate } from "../mobile/src/lib/document-library.ts";

function filters(query = "") {
  const parsed = parseMobileDocumentFilters(new URLSearchParams(query));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.filters;
}
// Evaluate the Prisma predicates against unrelated, private and assigned records.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function matches(record: Row, where: Row): boolean {
  return Object.entries(where).every(([field, value]) => {
    if (field === "AND") return value.every((condition: Row) => matches(record, condition));
    if (field === "OR") return value.some((condition: Row) => matches(record, condition));
    const actual = record[field];
    if (value === null || typeof value !== "object") return actual === value;
    if ("some" in value) return actual.some((row: Row) => matches(row, value.some));
    if ("in" in value && !value.in.includes(actual)) return false;
    if ("notIn" in value && value.notIn.includes(actual)) return false;
    if ("not" in value && actual === value.not) return false;
    if ("contains" in value && !String(actual ?? "").toLowerCase().includes(value.contains.toLowerCase())) return false;
    if ("gte" in value && (!actual || actual < value.gte)) return false;
    if ("lte" in value && (!actual || actual > value.lte)) return false;
    if (!["in", "notIn", "not", "contains", "gte", "lte"].some(key => key in value)) return matches(actual, value);
    return true;
  });
}
test("search and status cannot expose someone else's draft or unrelated completed document", () => {
  const records = [
    {id:"own-draft", drafterId:"staff", status:"DRAFT", title:"검색 대상", approvalSteps:[]},
    {id:"other-draft", drafterId:"other", status:"DRAFT", title:"검색 대상", approvalSteps:[{approverId:"staff"}]},
    {id:"own-sent", drafterId:"staff", status:"SUBMITTED", title:"검색 대상", approvalSteps:[]},
    {id:"own-approved", drafterId:"staff", status:"APPROVED", title:"검색 대상", approvalSteps:[]},
    {id:"assigned-rejected", drafterId:"other", status:"REJECTED", title:"검색 대상", approvalSteps:[{approverId:"staff"}]},
    {id:"unrelated-approved", drafterId:"other", status:"APPROVED", title:"검색 대상", approvalSteps:[]},
    {id:"other-recalled", drafterId:"other", status:"RECALLED", title:"검색 대상", approvalSteps:[{approverId:"staff"}]},
  ];
  for (const [folder, ids] of [["drafts", ["own-draft"]], ["sent", ["own-sent", "own-approved"]], ["completed", ["own-approved", "assigned-rejected"]]] as const) {
    assert.deepEqual(records.filter(row => matches(row, mobileDocumentWhere("staff", filters(`folder=${folder}&q=검색`)))).map(row => row.id), ids);
  }
  assert.deepEqual(records.filter(row => matches(row, mobileDocumentWhere("staff", filters("folder=sent&status=active")))).map(row => row.id), ["own-sent"]);
  assert.deepEqual(records.filter(row => matches(row, mobileDocumentWhere("staff", filters("folder=completed&status=rejected")))).map(row => row.id), ["assigned-rejected"]);
});
test("period filters include both boundaries in Korea and use the folder's relevant date", () => {
  for (const [folder, field] of [["sent", "submittedAt"], ["completed", "completedAt"], ["drafts", "updatedAt"]]) {
    const where = mobileDocumentWhere("staff", filters(`folder=${folder}&dateFrom=2026-10-02&dateTo=2026-10-02`));
    const base = {drafterId:"staff", status:folder === "drafts" ? "DRAFT" : folder === "sent" ? "SUBMITTED" : "APPROVED", approvalSteps:[]};
    for (const [date, expected] of [["2026-10-01T14:59:59.999Z", false], ["2026-10-01T15:00:00.000Z", true],
      ["2026-10-02T14:59:59.999Z", true], ["2026-10-02T15:00:00.000Z", false]] as const) {
      assert.equal(matches({...base, [field!]:new Date(date)}, where), expected, `${folder}: ${date}`);
    }
  }
});
test("invalid or contradictory filters fail explicitly instead of widening the search", () => {
  for (const query of ["dateFrom=2026-02-29", "dateTo=2026-04-31", "dateFrom=not-a-date", "dateFrom=2026-10-03&dateTo=2026-10-02",
    "page=0", "page=1.5", "page=9007199254740992", "folder=drafts&status=approved", "sort=random", `q=${"a".repeat(101)}`]) {
    assert.equal(parseMobileDocumentFilters(new URLSearchParams(query)).ok, false, query);
  }
  assert.equal(filters("dateFrom=2024-02-29").dateFrom, "2024-02-29");
  assert.equal(documentPeriodError("2024-02-29", ""), null);
  assert.ok(documentPeriodError("2026-02-29", ""));
  assert.ok(documentPeriodError("2026-10-03", "2026-10-02"));
});
test("client search preserves Korean text, reserved characters and every filter between pages", () => {
  const input = {...filters("folder=completed&status=rejected&dateFrom=2026-10-01&sort=oldest&page=3"), query:"  한글 & #+?  "};
  const path = documentLibraryPath(input);
  assert.deepEqual(filters(path.split("?")[1]), {...input, query:input.query.trim()});
  assert.deepEqual(mobileDocumentOrderBy(input), [{completedAt:{sort:"asc", nulls:"last"}}, {createdAt:"asc"}, {id:"asc"}]);
  assert.match(formatDocumentDate("2025-12-31T15:00:00Z"), /^2026\.\s*1\.\s*1\./);
});

const key = "__mobileDocumentLibraryHarness";
const state: Row = {total:41, requests:[], documents:[]};
const prisma = { approvalDocument: {
  async count(input: Row) { state.requests.push(["count", input]); return state.total; },
  async findMany(input: Row) { state.requests.push(["findMany", input]); return state.documents; },
} };
(globalThis as Row)[key] = {prisma};
let source = readFileSync(new URL("../src/lib/mobile-document-library.ts", import.meta.url), "utf8");
source = source.replace('import { prisma } from "@/lib/prisma";', `const prisma = globalThis.${key}.prisma;`);
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022}}).outputText;
const {getMobileDocumentPage} = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
beforeEach(() => Object.assign(state, {total:41, requests:[], documents:[]}));
after(() => { delete (globalThis as Row)[key]; });
test("pagination clamps stale pages, bounds payloads and selects summaries without private content", async () => {
  state.documents = [{id:"own", title:"문서", documentNo:null, category:"업무", status:"APPROVED", createdAt:new Date(0), updatedAt:new Date(1),
    submittedAt:new Date(2), completedAt:new Date(3), drafter:{name:"직원", passwordHash:"private-password"}, _count:{attachments:2},
    approvalSteps:[{approver:{name:"시설장"}, comment:"private-comment"}], content:"private-content", attachments:[{storageKey:"private-key"}]}];
  const data = await getMobileDocumentPage("staff", filters("page=999"));
  assert.equal(data.page, 3); assert.equal(data.totalPages, 3); assert.equal(data.pageSize, 20);
  const query = state.requests[1][1];
  assert.equal(query.skip, 40); assert.equal(query.take, 20);
  assert.deepEqual(query.where, state.requests[0][1].where);
  for (const field of ["content", "attachments", "auditLogs"]) assert.equal(field in query.select, false);
  assert.deepEqual(query.select.drafter, {select:{name:true}});
  assert.equal(JSON.stringify(data).includes("private-"), false);
  assert.equal(data.documents[0].currentApproverName, null);
  state.total = 0; state.documents = [];
  assert.deepEqual(await getMobileDocumentPage("staff", filters("page=999")), {folder:"sent", documents:[], total:0, page:1, pageSize:20, totalPages:1});
});
