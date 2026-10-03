import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { Prisma } from "../src/generated/prisma/client.ts";
import { getWorkLogToday } from "../src/lib/work-log-core.ts";
import { canWriteDailyReport } from "../src/lib/daily-report-core.ts";
import { parseMobileDailyReportListQuery, parseMobileDailyReportEditorQuery } from "../src/lib/mobile-daily-reports-core.ts";

// Actual authentication, routes, queries, and atomic mutations use a synthetic isolated store.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const employee = { id: "employee", name: "직원가", role: "USER", status: "ACTIVE", hireDate: null, resignationDate: null, position: { name: "생활지도원" }, department: { name: "운영팀" }, passwordHash: "private-password" };
const director = { ...employee, id: "director", name: "시설장", position: { name: "시설장" } };
const colleague = { ...employee, id: "colleague", name: "직원나", role: "ADMIN" };
const token = "t".repeat(43), today = getWorkLogToday();
const h: Row = { users: [], reports: [], youths: [], audits: [], reads: [], transactions: [], invalidated: [], session: null,
  auditFailure: false, updateFailure: false, queryFailure: false, txError: null, beforeTransaction: null, cacheFailure: false };
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part: Row) => matches(row, part));
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (key === "authorId_workDate") return matches(row, value);
    const current = row[key];
    if (value instanceof Date) return current?.getTime() === value.getTime();
    if (value === null || typeof value !== "object") return current === value;
    if ("not" in value && current === value.not) return false;
    if ("gte" in value && !(current !== null && current >= value.gte)) return false;
    if ("lte" in value && !(current !== null && current <= value.lte)) return false;
    return true;
  });
}
function select(row: Row, selection: Row): Row {
  return Object.fromEntries(Object.entries(selection).filter(([, include]) => include).map(([key, include]) => [key,
    typeof include === "object" && row[key] ? select(row[key], include.select) : row[key],
  ]));
}
function reportRow(row: Row) { return { ...row, author: h.users.find((user: Row) => user.id === row.authorId), reviewedBy: h.users.find((user: Row) => user.id === row.reviewedById) ?? null }; }
function sorted(rows: Row[], orderBy: Row | Row[] = {}) {
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const order of orders) for (const [key, dir] of Object.entries(order)) {
      const result = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
      if (result) return dir === "desc" ? -result : result;
    }
    return 0;
  });
}
function read(table: string, method: string, args: Row) { h.reads.push({ table, method, ...args }); }
const db = {
  mobileSession: { async findUnique() { return h.session; } },
  user: {
    async findUnique(args: Row) { read("user", "findUnique", args); const row = h.users.find((row: Row) => matches(row, args.where)); return row ? select(row, args.select) : null; },
    async findMany(args: Row) { read("user", "findMany", args); return sorted(h.users.filter((row: Row) => matches(row, args.where)), args.orderBy).map(row => select(row, args.select)); },
  },
  youth: { async findMany(args: Row) { read("youth", "findMany", args); return sorted(h.youths.filter((row: Row) => matches(row, args.where)), args.orderBy).map(row => select(row, args.select)); } },
  dailyWorkReport: {
    async findUnique(args: Row) { read("report", "findUnique", args); if (h.queryFailure) throw new Error("private-query-error"); const row = h.reports.find((row: Row) => matches(row, args.where)); return row ? select(reportRow(row), args.select) : null; },
    async findFirst(args: Row) { return this.findUnique(args); },
    async findUniqueOrThrow(args: Row) { const row = await this.findUnique(args); if (!row) throw new Error("Missing report"); return row; },
    async count(args: Row) { read("report", "count", args); return h.reports.filter((row: Row) => matches(row, args.where)).length; },
    async findMany(args: Row) {
      read("report", "findMany", args); if (h.queryFailure) throw new Error("private-query-error");
      return sorted(h.reports.filter((row: Row) => matches(row, args.where)), args.orderBy).slice(args.skip ?? 0, args.take ? (args.skip ?? 0) + args.take : undefined).map(row => select(reportRow(row), args.select));
    },
    async create({ data, select: selection }: Row) {
      if (h.reports.some((row: Row) => row.authorId === data.authorId && row.workDate.getTime() === data.workDate.getTime())) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "fixture" });
      const row = { id: `report-${h.reports.length + 1}`, version: 1, reviewedAt: null, reviewedById: null, updatedAt: new Date(), ...data };
      h.reports.push(row); return select(row, selection);
    },
    async updateMany({ where, data }: Row) {
      if (h.updateFailure) return { count: 0 };
      const row = h.reports.find((row: Row) => matches(row, where));
      if (!row) return { count: 0 };
      Object.assign(row, data, { version: row.version + (data.version?.increment ?? 0), updatedAt: new Date() }); return { count: 1 };
    },
  },
  auditLog: { async create({ data }: Row) { if (h.auditFailure) throw new Error("private-audit-error"); h.audits.push(data); } },
  async $transaction(operation: (tx: Row) => Promise<unknown>, options: Row = {}) {
    h.transactions.push(options);
    if (h.txError) throw h.txError;
    if (h.beforeTransaction) { const hook = h.beforeTransaction; h.beforeTransaction = null; hook(options); }
    const snapshot = structuredClone({ reports: h.reports, audits: h.audits });
    try { return await operation(db); } catch (error) { Object.assign(h, snapshot); throw error; }
  },
};
const key = "__mobileDailyReportHarness";
(globalThis as Row)[key] = { h, db };
const url = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mocks = url(`const {h,db} = globalThis.${key}; export const prisma=db;
export function revalidatePath(path) { if(h.cacheFailure) throw new Error('cache failure'); h.invalidated.push(path); }
export function getAuditLogRequestData() { return {ipAddress:'private-ip',userAgent:'private-device'}; }
`);
function compile(file: string, aliases: Record<string, string>) {
  let source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(aliases)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return url(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const base = { "@/lib/prisma": mocks, "@/lib/audit-log-request": mocks, "next/cache": mocks };
const access = compile("lib/youth-record-access.ts", base);
const queries = compile("lib/daily-report-queries.ts", { ...base, "@/lib/youth-record-access": access });
const mutation = compile("lib/daily-report-mutations.ts", { ...base, "@/lib/youth-record-access": access, "@/lib/daily-report-queries": queries });
const cache = compile("lib/daily-report-cache.ts", base);
const auth = compile("lib/mobile-auth.ts", base);
const adapter = compile("lib/mobile-daily-reports.ts", { ...base, "@/lib/mobile-auth": auth, "@/lib/daily-report-queries": queries, "@/lib/daily-report-mutations": mutation, "@/lib/daily-report-cache": cache });
const api = await import(adapter);
const route = async (path: string) => import(compile(`app/api/mobile/daily-reports/${path}route.ts`, { "@/lib/mobile-daily-reports": adapter }));
const listRoute = await route(""), editorRoute = await route("editor/"), detailRoute = await route("[id]/"), reviewRoute = await route("[id]/review/");
const context = (id: string) => ({ params: Promise.resolve({ id }) });
function signedIn(user = employee) { h.session = { id: "session", userId: user.id, user: structuredClone(user), expiresAt: new Date(Date.now() + 60000) }; }
function request(path = "", method = "GET", body?: unknown, overrides: Row = {}) {
  return new Request(`https://fixture.invalid/api/mobile/daily-reports${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, ...(method !== "GET" ? { "Content-Type": "application/json" } : {}), ...(overrides.headers ?? {}) },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}), ...overrides });
}
const values = (overrides: Row = {}) => ({ workDate: today, mainContent: "당일 주요 업무", youthReports: [], intent: "submit", version: 0, ...overrides });
async function save(overrides: Row = {}) { return listRoute.POST(request("", "POST", values(overrides))); }
async function review(id: string, version = 1) { return reviewRoute.POST(request(`/${id}/review`, "POST", { version }), context(id)); }
async function detail(id: string) { return detailRoute.GET(request(`/${id}`), context(id)); }
function seedReport(overrides: Row = {}) {
  const row = { id: `report-${h.reports.length + 1}`, authorId: employee.id, workDate: new Date(today + "T00:00:00Z"), version: 1,
    mainContent: "saved-main", youthReports: [], submittedAt: new Date(), reviewedAt: null, reviewedById: null, updatedAt: new Date(), ...overrides };
  h.reports.push(row); return row;
}
function youth(id = "youth-1", overrides: Row = {}) { return { id, name: "청소년가", admissionDate: null, dischargeDate: null, actualDischargeDate: null, purgeStartedAt: null, purgedAt: null, phone: "private-phone", ...overrides }; }
beforeEach(() => { Object.assign(h, { users: structuredClone([employee,director,colleague]), reports: [], youths: [youth()], audits: [], reads: [], transactions: [], invalidated: [],
  session: null, auditFailure: false, updateFailure: false, queryFailure: false, txError: null, beforeTransaction: null, cacheFailure: false }); signedIn(); });
after(() => { delete (globalThis as Row)[key]; });

const privateJson = (response: Response) => { assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("pragma"), "no-cache"); assert.equal(response.headers.get("location"), null); assert.match(response.headers.get("content-type")!, /application\/json/); };
test("all actual routes reject missing, expired, inactive and malformed sessions before data reads or body parsing", async () => {
  const calls = [() => listRoute.GET(request()), () => editorRoute.GET(request("/editor")), () => detail("missing"), () => save(), () => review("missing")];
  for (const session of [null, { ...h.session, expiresAt: new Date(0) }, { ...h.session, user: { ...employee, status: "INACTIVE" } }]) {
    h.session = session;
    for (const call of calls) { const response = await call(); assert.equal(response.status,401); privateJson(response); assert.deepEqual(await response.json(), {error:"로그인이 필요합니다.",code:"UNAUTHORIZED"}); }
  }
  signedIn(); assert.equal((await listRoute.GET(request("", "GET", undefined, { headers: { Authorization: "bad" } }))).status, 401);
  assert.deepEqual(h.reads, []); assert.deepEqual(h.reports, []); assert.deepEqual(h.audits, []);
});
test("fresh self actor lookup cannot rely on stale session employment or role", async () => {
  h.users[0].status = "INACTIVE";
  assert.equal((await listRoute.GET(request())).status, 401);
  h.users[0].status = "ACTIVE"; h.users[0].hireDate = "9999-01-01";
  const response = await listRoute.GET(request()); assert.equal(response.status,200); assert.equal((await response.json()).canWrite,false);
  assert.equal((await save()).status,403); assert.deepEqual(h.audits,[]);
  assert.ok(h.reads.filter((r: Row) => r.table === "user" && r.method === "findUnique").every((r: Row) => r.where.id === employee.id && !r.select.passwordHash && !r.select.role));
});
test("non-head ADMIN is own-scoped; facility-head USER sees only submitted reports and cannot edit", async () => {
  const draft = seedReport({ submittedAt:null, mainContent:"private-draft" }); const submitted = seedReport({ authorId:colleague.id });
  signedIn(colleague);
  assert.equal((await detail(draft.id)).status,404); assert.equal((await detail(submitted.id)).status,200);
  assert.deepEqual((await (await listRoute.GET(request())).json()).history.map((row: Row) => row.id),[submitted.id]);
  assert.equal((await review(submitted.id)).status,403);
  signedIn(director);
  assert.equal((await detail(draft.id)).status,404); assert.equal((await detail(submitted.id)).status,200);
  assert.equal((await editorRoute.GET(request("/editor"))).status,403); assert.equal((await save()).status,403);
  assert.equal(JSON.stringify(await (await listRoute.GET(request())).json()).includes("private-draft"),false);
});
test("employee history is paginated15, metadata-only, and todayStatus is independent of page2", async () => {
  const current = seedReport({submittedAt:null,mainContent:"private-report-body"});
  for(let n=1;n<=16;n++) seedReport({workDate:new Date(Date.UTC(2026,0,n)),mainContent:"private-report-body"});
  seedReport({authorId:colleague.id});
  const first=await (await listRoute.GET(request())).json(); const second=await (await listRoute.GET(request("?page=2"))).json();
  assert.equal(first.total,17); assert.equal(first.pageSize,15); assert.equal(first.history.length,15); assert.equal(second.history.length,2);
  assert.equal(first.history[0].id,current.id); assert.equal(first.todayStatus,"draft"); assert.equal(second.todayStatus,"draft");
  assert.equal(JSON.stringify(first).includes("private-report-body"),false); assert.equal(JSON.stringify(second).includes("mainContent"),false);
  assert.equal((await (await listRoute.GET(request("?page=99999999"))).json()).page,2);
  assert.ok(h.transactions.every((tx: Row) => tx.isolationLevel === "RepeatableRead"));
  const currentRead=h.reads.find((r: Row) => r.table==="report" && r.method==="findUnique"); assert.deepEqual(currentRead.select,{submittedAt:true,reviewedAt:true});
});
test("missing/draft/submitted/reviewed todayStatus and read-only employee archive remain accurate", async () => {
  assert.equal((await (await listRoute.GET(request())).json()).todayStatus,"missing");
  const row=seedReport({submittedAt:null}); assert.equal((await (await listRoute.GET(request())).json()).todayStatus,"draft");
  row.submittedAt=new Date(); assert.equal((await (await listRoute.GET(request())).json()).todayStatus,"submitted");
  row.reviewedAt=new Date(); assert.equal((await (await listRoute.GET(request())).json()).todayStatus,"reviewed");
  h.users[0].resignationDate="2000-01-01";
  const data=await (await listRoute.GET(request())).json(); assert.equal(data.canWrite,false); assert.equal(data.history.length,1); assert.equal(data.todayStatus,"reviewed");
  assert.equal((await detail(row.id)).status,200);
});
test("director counts include historical submitted authors and rows follow urgency/name/id ordering", async () => {
  h.users.push({...employee,id:"missing-a",name:"동명"},{...employee,id:"missing-b",name:"동명"}, {...employee,id:"former",name:"전 직원",status:"INACTIVE",resignationDate:"2000-01-01"});
  seedReport({authorId:colleague.id,reviewedAt:new Date()}); seedReport({authorId:"former"});
  signedIn(director);
  const data=await (await listRoute.GET(request())).json();
  assert.deepEqual(data.counts,{staff:5,submitted:2,missing:3,unreviewed:1});
  assert.equal(data.rows[0].staff.id,"former"); assert.equal(data.rows.at(-1).staff.id,colleague.id);
  assert.deepEqual(data.rows.filter((r: Row) => r.staff.name==="동명").map((r: Row) => r.staff.id),["missing-a","missing-b"]);
  assert.equal(data.pageSize,20); assert.equal(data.canWrite,false); assert.equal(data.filter,"all"); assert.equal(data.q,"");
  assert.equal(JSON.stringify(data).includes("mainContent"),false); assert.equal(JSON.stringify(data).includes("youthReports"),false);
});
test("director page20 and state/search filters preserve unfiltered daily counts", async () => {
  for(let n=0;n<22;n++) h.users.push({...employee,id:`staff-${n}`,name:`직원${String(n).padStart(2,"0")}`});
  seedReport({mainContent:"검색할 주요 보고"}); seedReport({authorId:colleague.id,reviewedAt:new Date()}); signedIn(director);
  const first=await (await listRoute.GET(request())).json(); const second=await (await listRoute.GET(request("?page=2"))).json();
  assert.equal(first.rows.length,20); assert.equal(second.rows.length,4); assert.equal(first.total,24); assert.deepEqual(second.counts,first.counts);
  for(const [filter,total] of [["unread",1],["reviewed",1],["missing",22]]) {
    const filtered=await (await listRoute.GET(request(`?filter=${filter}`))).json(); assert.equal(filtered.total,total); assert.deepEqual(filtered.counts,first.counts);
  }
  const searched=await (await listRoute.GET(request("?q="+encodeURIComponent("검색할")))).json(); assert.equal(searched.total,1); assert.deepEqual(searched.counts,first.counts);
});
test("strict query rejects duplicate/unknown/invalid/future date and malformed page without report reads", async () => {
  for(const query of ["?page=0","?page=-1","?page=1.2","?page=1e2","?page=","?page=1&page=2","?date=2026-02-30","?date=9999-01-01","?date=","?authorId=other","?filter=all","?q=test"]) {
    h.reads=[]; const response=await listRoute.GET(request(query)); assert.equal(response.status,400,query); privateJson(response); assert.equal(h.reads.filter((r: Row) => r.table==="report").length,0);
  }
  signedIn(director); for(const query of ["?filter=bad","?q="+"x".repeat(201),"?filter=all&filter=all"]) assert.equal((await listRoute.GET(request(query))).status,400);
  for(const query of ["?date=2026-02-30","?page=1","?date=2026-01-01&date=2026-01-02"]) assert.equal((await editorRoute.GET(request("/editor"+query))).status,403);
  signedIn(); assert.equal((await editorRoute.GET(request("/editor?date=2026-02-30"))).status,400);
});
test("editor reveals only youth id/name, server recipients and own operational snapshot notes", async () => {
  seedReport({youthReports:[{youthId:"youth-1",youthName:"보고 당시 이름",content:"관찰 기록"}]}); h.youths[0].name="변경된 이름";
  const response=await editorRoute.GET(request("/editor")); privateJson(response); const data=await response.json();
  assert.deepEqual(data.youths,[{id:"youth-1",name:"보고 당시 이름"}]); assert.deepEqual(data.recipients,["시설장"]); assert.equal(data.entry.youthReports[0].youthName,"보고 당시 이름");
  assert.equal(JSON.stringify(data).includes("private-"),false);
});
test("detail unauthorized/missing/malformed IDs have identical404 without raw notes or staff data", async () => {
  const other=seedReport({authorId:colleague.id,mainContent:"private-body"});
  const bodies=[];for(const id of [other.id,"missing","bad/id"," ","x".repeat(129)]) {const response=await detail(id);assert.equal(response.status,404);privateJson(response);bodies.push(await response.json());}
  assert.ok(bodies.every(body=>JSON.stringify(body)===JSON.stringify(bodies[0]))); assert.equal(JSON.stringify(bodies).includes("private-"),false);
});
test("current operational scope hides restricted notes from editor/detail/list search even on historical dates", async () => {
  const date="2026-01-02";
  h.youths.push(youth("restricted",{name:"비공개청소년",actualDischargeDate:"2026-02-01"}));
  const row=seedReport({workDate:new Date(date+"T00:00:00Z"),youthReports:[{youthId:"restricted",youthName:"비공개청소년",content:"비공개기록"},{youthId:"youth-1",youthName:"청소년가",content:"보이는기록"}]});
  const editor=await (await editorRoute.GET(request("/editor?date="+date))).json();assert.equal(JSON.stringify(editor).includes("비공개"),false);
  assert.equal(JSON.stringify(await (await detail(row.id)).json()).includes("비공개"),false);
  signedIn(director);
  for(const q of ["비공개청소년","비공개기록","restricted"]) {const data=await (await listRoute.GET(request(`?date=${date}&q=${encodeURIComponent(q)}`))).json();assert.equal(data.total,0);assert.equal(data.counts.submitted,1);}
  assert.equal((await (await listRoute.GET(request(`?date=${date}&q=${encodeURIComponent("보이는기록")}`))).json()).total,1);
});
for(const [name,restriction] of [["actual discharge",{actualDischargeDate:"2026-01-01"}],["past scheduled discharge",{dischargeDate:"2000-01-01"}],["purging",{purgeStartedAt:new Date()}],["purged",{purgedAt:new Date()}]] as const) {
  test(`${name} notes are preserved in storage, hidden in success, and rejected as stale input`,async()=>{
    h.youths[0]={...h.youths[0],...restriction};const row=seedReport({youthReports:[{youthId:"youth-1",youthName:"private-retained-name",content:"private-retained-content"}]});
    const stale=await save({version:1,youthReports:[{youthId:"youth-1",content:"new input"}]});assert.equal(stale.status,400);const error=await stale.json();assert.equal(error.code,"ROSTER_CHANGED");assert.ok(error.fields.youthReports);
    const success=await save({version:1,youthReports:[]});assert.equal(success.status,200);assert.deepEqual((await success.json()).entry.youthReports,[]);assert.equal(h.reports[0].youthReports[0].content,"private-retained-content");assert.equal(h.reports[0].id,row.id);
  });
}
test("save uses own author/server youth snapshot, increments every save, and preserves first submission time",async()=>{
  const response=await save({youthReports:[{youthId:"youth-1",content:" 관찰 기록 "}]});assert.equal(response.status,200);privateJson(response);const initial=(await response.json()).entry;
  assert.equal(initial.authorId,employee.id);assert.deepEqual(initial.youthReports,[{youthId:"youth-1",youthName:"청소년가",content:"관찰 기록"}]);
  h.youths[0].name="이름변경";h.reports[0].reviewedAt=new Date();h.reports[0].reviewedById=director.id;
  const next=(await (await save({version:1,youthReports:[{youthId:"youth-1",content:"관찰 기록"}]})).json()).entry;
  assert.equal(next.version,2);assert.equal(next.submittedAt,initial.submittedAt);assert.equal(next.reviewedAt,null);assert.equal(next.reviewedByName,null);assert.equal(next.youthReports[0].youthName,"청소년가");
  assert.equal(h.audits.length,2);assert.deepEqual(h.audits[1].metadata,{changeType:"dailyReport.submit",workDate:today,youthReportCount:1});assert.equal(JSON.stringify(next).includes("private-"),false);
  assert.ok(h.transactions.every((tx: Row)=>tx.isolationLevel==="Serializable"));assert.ok(h.invalidated.includes("/work-schedule/daily-reports"));assert.ok(h.invalidated.includes("/"));
});
test("optional blank draft works without directors; submit requires current director and cannot revert submitted report",async()=>{
  h.users=h.users.filter((u: Row)=>u.id!==director.id);
  const missing=await save();assert.equal(missing.status,400);assert.equal((await missing.json()).code,"DIRECTOR_UNAVAILABLE");assert.deepEqual(h.reports,[]);
  assert.equal((await save({intent:"draft",mainContent:"  "})).status,200);assert.equal(h.reports[0].submittedAt,null);
  h.users.push(director);assert.equal((await save({version:1})).status,200);
  const reverted=await save({version:2,intent:"draft"});assert.equal(reverted.status,400);assert.equal((await reverted.json()).code,"INVALID_REQUEST");assert.equal(h.reports[0].version,2);
});
test("current employment and director position are rechecked inside the save/review transaction",async()=>{
  h.beforeTransaction=()=>{h.users[0].resignationDate="2000-01-01";};assert.equal((await save()).status,403);assert.deepEqual(h.reports,[]);assert.deepEqual(h.audits,[]);
  h.users[0].resignationDate=null;const row=seedReport();signedIn(director);
  h.beforeTransaction=()=>{h.users.find((u: Row)=>u.id===director.id).position.name="생활지도원";};assert.equal((await review(row.id)).status,403);assert.equal(h.reports[0].reviewedAt,null);assert.deepEqual(h.audits,[]);
});
test("version0 duplicate, stale version, conditional-update race and serialization failures never overwrite",async()=>{
  assert.equal((await save()).status,200);
  assert.equal((await save({mainContent:"overwrite"})).status,409);assert.equal(h.reports[0].mainContent,"당일 주요 업무");assert.equal(h.audits.length,1);
  h.updateFailure=true;assert.equal((await save({version:1})).status,409);h.updateFailure=false;
  for(const code of ["P2002","P2034"]) {h.txError=new Prisma.PrismaClientKnownRequestError("private-error",{code,clientVersion:"fixture"});const response=await save({version:1});assert.equal(response.status,409);assert.equal((await response.json()).code,"REPORT_CONFLICT");}
  assert.equal(h.reports[0].version,1);assert.equal(h.audits.length,1);
});
test("failed save/review audit rolls back report and returns private generic500",async()=>{
  const row=seedReport();h.auditFailure=true;
  const saved=await save({version:1,mainContent:"would rollback"});assert.equal(saved.status,500);privateJson(saved);assert.equal((await saved.json()).code,"INTERNAL_ERROR");assert.equal(h.reports[0].mainContent,"saved-main");assert.equal(h.reports[0].version,1);
  signedIn(director);assert.equal((await review(row.id)).status,500);assert.equal(h.reports[0].reviewedAt,null);assert.deepEqual(h.audits,[]);
});
test("review is submitted-only, repeated/stale conflicts; review version unchanged and correction resets review",async()=>{
  const draft=seedReport({submittedAt:null}), row=seedReport({authorId:colleague.id});signedIn(director);
  assert.equal((await review(draft.id)).status,404);assert.equal((await review("missing")).status,404);
  const response=await review(row.id);assert.equal(response.status,200);privateJson(response);const entry=(await response.json()).entry;assert.equal(entry.version,1);assert.ok(entry.reviewedAt);assert.equal(entry.reviewedByName,director.name);
  assert.equal((await review(row.id)).status,409);assert.equal(h.audits.length,1);
  signedIn(colleague);assert.equal((await save({version:1})).status,200);assert.equal(h.reports[1].version,2);assert.equal(h.reports[1].reviewedAt,null);
  signedIn(director);assert.equal((await review(row.id,1)).status,409);assert.equal((await review(row.id,2)).status,200);
});
test("purge increasing report version prevents stale mobile restoration",async()=>{
  seedReport({youthReports:[{youthId:"youth-1",youthName:"old name",content:"old content"}]});
  h.beforeTransaction=()=>{h.reports[0].youthReports=[];h.reports[0].version=2;h.youths[0].purgedAt=new Date();};
  const response=await save({version:1,youthReports:[{youthId:"youth-1",content:"restore attempt"}]});assert.equal(response.status,409);assert.equal(h.reports[0].version,2);assert.deepEqual(h.reports[0].youthReports,[]);assert.deepEqual(h.audits,[]);
});
test("strict JSON types, unknown fields, duplicates and content bounds fail before mutations with field feedback",async()=>{
  for(const overrides of [{version:"0"},{version:true},{version:-1},{version:1000000000},{intent:"delete"},{workDate:"9999-01-01"},{mainContent:" "},{mainContent:"x".repeat(10001)},
    {authorId:colleague.id},{mode:"director"},{requestId:"ignored"},{youthReports:[{youthId:"youth-1",content:"note",youthName:"forged"}]},
    {youthReports:[{youthId:"youth-1",content:""},{youthId:"youth-1",content:""}]},{youthReports:Array.from({length:201},(_,n)=>({youthId:`y-${n}`,content:""}))},
    {youthReports:[{youthId:"youth-1",content:"x".repeat(4001)}]},{youthReports:null}]) {
    const response=await save(overrides);assert.equal(response.status,400);assert.equal((await response.json()).code,"INVALID_REQUEST");
  }
  assert.deepEqual(h.reports,[]);assert.deepEqual(h.audits,[]);
  const error=await (await save({youthReports:[{youthId:"youth-1",content:"x".repeat(4001)}]})).json();assert.ok(error.fields["youth-youth-1"]);
});
test("bounded JSON handles MIME, malformed JSON, invalid UTF8, forged lengths and stream cap without content-length",async()=>{
  for(const req of [request("","POST","{invalid"),request("","POST",values(),{headers:{Authorization:`Bearer ${token}`,"Content-Type":"text/plain"}}),
    request("","POST",values(),{headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Content-Length":"banana"}}),
    request("","POST",values(),{headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Content-Length":String(8*1024*1024+1)}}),
    request("","POST",undefined,{body:new Uint8Array([255,254])})]) {
    const response=await listRoute.POST(req);assert.ok([400,413].includes(response.status));privateJson(response);
  }
  const response=await listRoute.POST(request("","POST"," ".repeat(8*1024*1024+1)));assert.equal(response.status,413);assert.equal((await response.json()).code,"PAYLOAD_TOO_LARGE");
  assert.deepEqual(h.reports,[]);assert.deepEqual(h.audits,[]);
});
test("8MiB transport admits valid maximum Korean Unicode-escaped payload using the existing JS limits",async()=>{
  h.youths=Array.from({length:200},(_,n)=>youth(`youth-${n}`));
  const payload=values({mainContent:"가".repeat(10000),youthReports:h.youths.map((y: Row)=>({youthId:y.id,content:"가".repeat(4000)}))});
  const body=JSON.stringify(payload).replaceAll("가","\\uac00");assert.ok(Buffer.byteLength(body)>4*1024*1024);assert.ok(Buffer.byteLength(body)<8*1024*1024);
  const response=await listRoute.POST(request("","POST",body));assert.equal(response.status,200);assert.equal((await response.json()).entry.youthReports.length,200);
});
test("serialized youth limit is preserved even when each individual note meets4000 and total count200",async()=>{
  const response=await save({youthReports:Array.from({length:200},(_,n)=>({youthId:`youth-${n}`,content:"\\".repeat(4000)}))});assert.equal(response.status,400);assert.ok((await response.json()).fields.youthReports);assert.deepEqual(h.reports,[]);
});
test("request body read timeout cancels before opening a mutation transaction",async(t)=>{
  const original=globalThis.setTimeout;let cancellation=false,observedDelay=0;
  t.mock.method(globalThis,"setTimeout",((fn: (...args: unknown[])=>void,delay: number,...args: unknown[])=>{observedDelay=delay;return original(fn,5,...args);}) as typeof globalThis.setTimeout);
  const body=new ReadableStream<Uint8Array>({cancel(){cancellation=true;}});
  const response=await listRoute.POST(request("","POST",undefined,{body,duplex:"half"}));assert.equal(response.status,408);assert.equal((await response.json()).code,"REQUEST_TIMEOUT");assert.ok(observedDelay>9000 && observedDelay<=10000);assert.equal(cancellation,true);assert.deepEqual(h.transactions,[]);assert.deepEqual(h.reports,[]);
});
test("home returns metadata-only statuses and unavailable on query failure rather than false missing",async()=>{
  seedReport({submittedAt:null,mainContent:"private-body",youthReports:[{youthId:"youth-1",youthName:"private-name",content:"private-content"}]});
  assert.deepEqual(await api.getMobileDailyReportHomeSummary(employee.id),{mode:"employee",today,status:"draft"});
  assert.deepEqual(await api.getMobileDailyReportHomeSummary(director.id),{mode:"director",today,submitted:0,unreviewed:0});
  h.queryFailure=true;const previous=console.error;console.error=()=>{};try {assert.deepEqual(await api.getMobileDailyReportHomeSummary(employee.id),{mode:"unavailable",today});}finally{console.error=previous;}
  h.queryFailure=false;h.users[0].resignationDate="2000-01-01";assert.equal(await api.getMobileDailyReportHomeSummary(employee.id),null);
  assert.ok(h.reads.filter((r: Row)=>r.table==="report").every((r: Row)=>!r.select.mainContent && !r.select.youthReports));
});
test("KST date boundary and employment equality are distinct from task creation policy",()=>{
  assert.equal(getWorkLogToday(new Date("2026-12-31T14:59:59Z")),"2026-12-31");assert.equal(getWorkLogToday(new Date("2026-12-31T15:00:00Z")),"2027-01-01");
  assert.equal(canWriteDailyReport({...employee,hireDate:today,resignationDate:today},today),true);
  assert.throws(()=>parseMobileDailyReportListQuery(new URLSearchParams("date=2027-01-01"),false,"2026-12-31"));
  assert.equal(parseMobileDailyReportEditorQuery(new URLSearchParams("date=2026-12-31"),"2027-01-01"),"2026-12-31");
});


test("editor unions operational off-roster snapshots with stored names and does not truncate the roster at200",async()=>{
  h.youths=Array.from({length:201},(_,n)=>youth(`new-youth-${n}`,{name:`청소년${n}`}));
  h.youths.push(youth("off-roster",{name:"changed name",admissionDate:"9999-01-01"}));
  seedReport({youthReports:[{youthId:"off-roster",youthName:"stored name",content:"old operational note"}]});
  const data=await (await editorRoute.GET(request("/editor"))).json();assert.equal(data.youths.length,202);assert.deepEqual(data.youths.find((y: Row)=>y.id==="off-roster"),{id:"off-roster",name:"stored name"});
  const response=await save({version:1,youthReports:[{youthId:"off-roster",content:"edited operational note"}]});assert.equal(response.status,200);assert.equal((await response.json()).entry.youthReports[0].youthName,"stored name");
});


test("facility-head save is FORBIDDEN, while employment-only failures preserve employee read mode",async()=>{
  signedIn(director);assert.equal((await (await save()).json()).code,"FORBIDDEN");
  signedIn();h.beforeTransaction=()=>{h.users[0].position.name="시설장";};const promoted=await save();assert.equal(promoted.status,403);assert.equal((await promoted.json()).code,"FORBIDDEN");assert.deepEqual(h.audits,[]);
  h.users[0].position.name="생활지도원";h.users[0].hireDate="9999-01-01";assert.equal((await (await save()).json()).code,"NOT_ELIGIBLE");
});
test("actor removed or disabled during mutation returns UNAUTHORIZED401 rather than employee read permission",async()=>{
  for(const remove of [false,true]) {
    h.users=structuredClone([employee,director,colleague]);signedIn();h.beforeTransaction=()=>{if(remove)h.users=h.users.filter((u: Row)=>u.id!==employee.id);else h.users[0].status="INACTIVE";};
    const saved=await save();assert.equal(saved.status,401);assert.equal((await saved.json()).code,"UNAUTHORIZED");
    h.users=structuredClone([employee,director,colleague]);const row=seedReport();signedIn(director);h.beforeTransaction=()=>{if(remove)h.users=h.users.filter((u: Row)=>u.id!==director.id);else h.users.find((u: Row)=>u.id===director.id).status="INACTIVE";};
    const reviewed=await review(row.id);assert.equal(reviewed.status,401);assert.equal((await reviewed.json()).code,"UNAUTHORIZED");
  }
  assert.deepEqual(h.audits,[]);
});
test("declared body length must match actual UTF8 bytes before any mutation",async()=>{
  const body=JSON.stringify(values({mainContent:"가나다"}));
  for(const length of [0,Buffer.byteLength(body)-1,Buffer.byteLength(body)+1]) {
    const response=await listRoute.POST(request("","POST",body,{headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Content-Length":String(length)}}));assert.equal(response.status,400);assert.equal((await response.json()).code,"INVALID_REQUEST");
  }
  assert.deepEqual(h.transactions,[]);assert.deepEqual(h.audits,[]);
  assert.equal((await listRoute.POST(request("","POST",body,{headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Content-Length":String(Buffer.byteLength(body))}}))).status,200);
});
