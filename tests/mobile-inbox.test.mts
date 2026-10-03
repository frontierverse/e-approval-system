import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { mobileInboxOrderBy, mobileInboxWhere, parseMobileInboxFilters } from "../src/lib/mobile-inbox-core.ts";
import { inboxPath } from "../mobile/src/lib/inbox.ts";

function filters(query = "") {
  const parsed = parseMobileInboxFilters(new URLSearchParams(query));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.filters;
}
// Evaluate the actual database predicates against assigned and unrelated fixtures.
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
    if ("not" in value && actual === value.not) return false;
    if ("contains" in value && !String(actual ?? "").toLowerCase().includes(value.contains.toLowerCase())) return false;
    if ("gte" in value && (!actual || actual < value.gte)) return false;
    if ("lte" in value && (!actual || actual > value.lte)) return false;
    if (!["in", "not", "contains", "gte", "lte"].some(key => key in value)) return matches(actual, value);
    return true;
  });
}
const make = (id: string, changes: Row = {}) => ({ id, title:"시설 운영 ABC", documentNo:"바자울-2026-001", category:"업무기안",
  status:"SUBMITTED", createdAt:new Date(0), submittedAt:new Date("2026-10-01T15:00:00Z"),
  approvalSteps:[{approverId:"head", status:"PENDING", order:1}], drafter:{name:"직원 김하늘"}, _count:{attachments:1}, ...changes });
test("search never widens the pending assignment and document status boundary", () => {
  const rows = [make("own"), make("other", {approvalSteps:[{approverId:"other",status:"PENDING"}]}),
    make("acted", {approvalSteps:[{approverId:"head",status:"APPROVED"}]}),
    ...["DRAFT","RECALLED","APPROVED","REJECTED","DISCARDED"].map(status => make(status,{status}))];
  for (const query of ["abc", "바자울", "업무기안", "김하늘"]) {
    const where = mobileInboxWhere("head", filters(`q=${query}&folder=completed&userId=other`));
    assert.deepEqual(rows.filter(row => matches(row, where)).map(row => row.id), ["own"]);
  }
});
test("submission date uses inclusive Korean calendar boundaries and creation fallback", () => {
  const where = mobileInboxWhere("head", filters("dateFrom=2026-10-02&dateTo=2026-10-02"));
  for (const [date, expected] of [["2026-10-01T14:59:59.999Z",false],["2026-10-01T15:00:00Z",true],
    ["2026-10-02T14:59:59.999Z",true],["2026-10-02T15:00:00Z",false]] as const) {
    assert.equal(matches(make("doc",{submittedAt:new Date(date)}),where),expected,date);
    assert.equal(matches(make("doc",{submittedAt:null,createdAt:new Date(date)}),where),expected,date);
  }
});
test("client encoding retains all criteria and invalid filters fail without widening", () => {
  const input = {query:" 한글 & #+? ",dateFrom:"2024-02-29",dateTo:"",sort:"oldest" as const,page:3};
  assert.deepEqual(filters(inboxPath(input).split("?")[1]),{...input,query:input.query.trim()});
  assert.deepEqual(mobileInboxOrderBy(input),[{submittedAt:{sort:"asc",nulls:"last"}},{createdAt:"asc"},{id:"asc"}]);
  for (const value of ["page=-1","page=1.5","page=9007199254740992","dateFrom=2026-02-29","dateTo=2026-04-31",
    "dateFrom=2026-10-03&dateTo=2026-10-02","sort=random",`q=${"x".repeat(101)}`]) {
    assert.equal(parseMobileInboxFilters(new URLSearchParams(value)).ok,false,value);
  }
});
const key = "__mobileInboxHarness";
const state: Row = {rows:[],requests:[]};
const prisma = {approvalDocument:{
  async count(input: Row) {state.requests.push(input); return state.rows.filter((row: Row) => matches(row,input.where)).length;},
  async findMany(input: Row) {
    state.requests.push(input);
    const direction = input.orderBy[2].id === "asc" ? 1 : -1;
    return state.rows.filter((row: Row) => matches(row,input.where)).sort((a: Row,b: Row)=>a.id.localeCompare(b.id)*direction).slice(input.skip,input.skip+input.take);
  },
}};
(globalThis as Row)[key] = {prisma};
let source = readFileSync(new URL("../src/lib/mobile-inbox.ts",import.meta.url),"utf8");
source = source.replace('import { prisma } from "@/lib/prisma";',`const prisma = globalThis.${key}.prisma;`);
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {getMobileInboxPage} = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
beforeEach(()=>Object.assign(state,{rows:Array.from({length:61},(_,i)=>make(String(i+1).padStart(3,"0"))),requests:[]}));
after(()=>{delete (globalThis as Row)[key];});
test("every document beyond the former 30 limit is reachable exactly once with a stable tie breaker",async()=>{
  for (const sort of ["latest","oldest"]) {
    const ids: string[] = [];
    for (let page=1;page<=4;page++) {
      const data=await getMobileInboxPage("head",filters(`page=${page}&sort=${sort}`));
      assert.equal(data.total,61); assert.equal(data.totalPages,4); assert.equal(data.pageSize,20);
      assert.ok(data.documents.length<=20); ids.push(...data.documents.map((row:Row)=>row.id));
    }
    assert.equal(ids.length,61); assert.equal(new Set(ids).size,61);
    assert.equal(ids[0],sort==="oldest" ? "001" : "061");
  }
});
test("approval on the last page clamps the next refresh and summaries omit private payloads",async()=>{
  const last=await getMobileInboxPage("head",filters("page=4"));
  state.rows=state.rows.filter((row:Row)=>row.id!==last.documents[0].id);
  const refreshed=await getMobileInboxPage("head",filters("page=4"));
  assert.equal(refreshed.page,3); assert.equal(refreshed.totalPages,3); assert.equal(refreshed.documents.length,20);
  const query=state.requests.at(-1);
  for (const name of ["content","attachments","auditLogs"]) assert.equal(name in query.select,false);
  assert.deepEqual(query.select.drafter,{select:{name:true}});
  assert.deepEqual(query.select.approvalSteps.where,{approverId:"head",status:"PENDING"});
  state.rows=[make("private",{content:"private-content",drafter:{name:"직원",passwordHash:"private-password"},
    approvalSteps:[{order:1,approverId:"head",status:"PENDING",comment:"private-comment"}]})];
  assert.equal(JSON.stringify(await getMobileInboxPage("head",filters())).includes("private-"),false);
  state.rows=[];
  assert.deepEqual(await getMobileInboxPage("head",filters("page=999")),{documents:[],total:0,page:1,pageSize:20,totalPages:1});
});
