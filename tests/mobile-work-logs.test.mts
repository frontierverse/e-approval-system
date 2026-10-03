import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { Prisma } from "../src/generated/prisma/client.ts";
import { getWorkLogToday, getWorkLogContributionRange } from "../src/lib/work-log-core.ts";
import { compileDocumentTemplateContent } from "../src/lib/draft-template-content.ts";
import { getMeetingMinutesDocumentTemplateSchema } from "../src/lib/document-template-schema.ts";

// Actual auth, strict parser, queries, domain, routes and web actions use an isolated store.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const employee = { id:"employee", name:"직원가", role:"ADMIN", status:"ACTIVE", position:{name:"시설장"}, hireDate:"9999-01-01", resignationDate:"2000-01-01", passwordHash:"PRIVATE_PASSWORD" };
const other = {...employee, id:"other", name:"직원나"}, today = getWorkLogToday(), token = "t".repeat(43);
const h: Row = { logs:[], users:[], tasks:[], documents:[], schedules:[], audits:[], reads:[], transactions:[], invalidated:[], session:null, auditFailure:false, taskFailure:false, meetingFailure:false, scheduleFailure:false, deleteRace:false, txErrors:0, beforeTx:null, cacheFailure:false, nextId:0 };
const eq = (a: unknown,b: unknown) => a instanceof Date && b instanceof Date ? a.getTime()===b.getTime() : a===b;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key,value]) => {
    if(key==="AND") return (Array.isArray(value)?value:[value]).every((part:Row)=>matches(row,part));
    if(key==="OR") return value.some((part:Row)=>matches(row,part));
    if(key==="authorId_workDate") return matches(row,value);
    const current=row[key];
    if(value===null || value instanceof Date || typeof value!=="object") return eq(current,value);
    if("not" in value && eq(current,value.not)) return false;
    if("in" in value && !value.in.some((v:unknown)=>eq(current,v))) return false;
    if("gte" in value && !(current!=null&&current>=value.gte)) return false;
    if("lte" in value && !(current!=null&&current<=value.lte)) return false;
    if("lt" in value && !(current!=null&&current<value.lt)) return false;
    if("has" in value && !(current??[]).includes(value.has)) return false;
    if("some" in value) return (current??[]).some((v:Row)=>matches(v,value.some));
    if("is" in value) return current!=null&&matches(current,value.is);
    return true;
  });
}
function project(row: Row, select?: Row): Row {
  if(!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([,yes])=>yes).map(([key,selection])=>[key,selection===true?structuredClone(row[key]):Array.isArray(row[key])?findMany(row[key],selection):row[key]==null?row[key]:project(row[key],(selection as Row).select)]));
}
function findMany(rows:Row[], args:Row):Row[] {
  const orders=Array.isArray(args.orderBy)?args.orderBy:[args.orderBy??{}];
  const result=rows.filter(row=>matches(row,args.where)).sort((a,b)=>{for(const order of orders)for(const [key,dir]of Object.entries(order)){const cmp=a[key]<b[key]?-1:a[key]>b[key]?1:0;if(cmp)return dir==="desc"?-cmp:cmp;}return 0;});
  return result.slice(args.skip??0,args.take===undefined?undefined:(args.skip??0)+args.take).map(row=>project(row,args.select));
}
function logRow(row:Row){return {...row,author:h.users.find((u:Row)=>u.id===row.authorId),updatedBy:h.users.find((u:Row)=>u.id===row.updatedById)??null};}
function read(model:string,args:Row){h.reads.push({model,...args});}
const db={
  mobileSession:{async findUnique(){return h.session;}},
  user:{async findUnique(args:Row){read("user",args);const row=h.users.find((u:Row)=>matches(u,args.where));return row?project(row,args.select):null;}},
  workLog:{
    async findUnique(args:Row){read("workLog",args);const row=h.logs.find((row:Row)=>matches(row,args.where));return row?project(logRow(row),args.select):null;},
    async findFirst(args:Row){return this.findUnique(args);},
    async findMany(args:Row){read("workLog",args);return findMany(h.logs.map(logRow),args);},
    async upsert(args:Row){let row=h.logs.find((row:Row)=>matches(row,args.where));if(row)Object.assign(row,args.update);else{row={id:`manual-${++h.nextId}`,createdAt:new Date(),updatedAt:new Date(),updatedById:null,...args.create};h.logs.push(row);}return project(logRow(row),args.select);},
    async deleteMany(args:Row){if(h.deleteRace)return {count:0};const old=h.logs.length;h.logs=h.logs.filter((row:Row)=>!matches(row,args.where));return {count:old-h.logs.length};},
  },
  staffTask:{async findMany(args:Row){read("staffTask",args);if(h.taskFailure)throw Error("PRIVATE_TASK_FAILURE");return findMany(h.tasks,args);}},
  approvalDocument:{async findMany(args:Row){read("approvalDocument",args);if(h.meetingFailure)throw Error("PRIVATE_MEETING_FAILURE");return findMany(h.documents,args);}},
  youthPersonalSchedule:{async findMany(args:Row){read("youthPersonalSchedule",args);if(h.scheduleFailure)throw Error("PRIVATE_SCHEDULE_FAILURE");return findMany(h.schedules,args);}},
  auditLog:{async create({data}:Row){if(h.auditFailure)throw Error("PRIVATE_AUDIT_FAILURE");h.audits.push(structuredClone(data));return data;}},
  async $queryRaw(sql:Row){
    read("taskDates",{sql});if(h.taskFailure)throw Error("PRIVATE_TASK_FAILURE");
    const [authorId,end,...rest]=sql.values,start=rest.find((v:unknown)=>v instanceof Date),limit=rest.find((v:unknown)=>typeof v==="number");
    const dates=[...new Set(h.tasks.filter((row:Row)=>row.assigneeId===authorId&&!row.deletedAt&&row.completedAt&&row.completedAt<end&&(!start||row.completedAt>=start)).map((row:Row)=>getWorkLogToday(row.completedAt)))].sort().reverse();
    return (limit?dates.slice(0,limit):dates).map(workDate=>({workDate}));
  },
  async $executeRawUnsafe(command:string){read("savepoint",{command});return 0;},
  async $transaction(operation:(db:Row)=>Promise<unknown>,options:Row){
    h.transactions.push(options);h.beforeTx?.();if(h.txErrors-->0)throw new Prisma.PrismaClientKnownRequestError("retry",{code:h.txErrorCode??"P2034",clientVersion:"fixture"});
    const previous=structuredClone({logs:h.logs,audits:h.audits});try{return await operation({...db});}catch(error){Object.assign(h,previous);throw error;}
  },
};
const key="__mobileWorkLogHarness";(globalThis as Row)[key]={h,db};
const url=(source:string)=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mocks=url(`const {h,db}=globalThis.${key};export const prisma=db;export async function requireUser(){return h.session.user;}export async function getCurrentAuditLogRequestData(){return {ipAddress:'PRIVATE_IP'};}export function getAuditLogRequestData(){return {ipAddress:'PRIVATE_IP'};}export function revalidatePath(path){if(h.cacheFailure)throw Error('cache');h.invalidated.push(path);}export function logServerEvent(){}export function getSafeErrorDigest(){return 'safe';}`);
function compile(file:string,aliases:Record<string,string>){let source=readFileSync(new URL(`../src/${file}`,import.meta.url),"utf8");for(const[from,to]of Object.entries(aliases))source=source.replaceAll(`"${from}"`,JSON.stringify(to));return url(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
const base={"@/lib/prisma":mocks,"@/lib/audit-log-request":mocks,"next/cache":mocks,"@/lib/auth":mocks,"@/lib/observability":mocks};
const tasks=compile("lib/work-log-linked-tasks.ts",base),meetings=compile("lib/work-log-linked-meetings.ts",base),schedules=compile("lib/work-log-linked-schedules.ts",base);
const queries=compile("lib/work-logs.ts",{...base,"@/lib/work-log-linked-tasks":tasks,"@/lib/work-log-linked-meetings":meetings,"@/lib/work-log-linked-schedules":schedules});
const mutations=compile("lib/work-log-mutations.ts",{...base,"@/lib/work-logs":queries}),cache=compile("lib/work-log-cache.ts",base),auth=compile("lib/mobile-auth.ts",base);
const adapter=compile("lib/mobile-work-logs.ts",{...base,"@/lib/work-logs":queries,"@/lib/work-log-linked-schedules":schedules,"@/lib/work-log-mutations":mutations,"@/lib/work-log-cache":cache,"@/lib/mobile-auth":auth});
const core=await import(compile("lib/mobile-work-logs-core.ts",{}));
const domain=await import(mutations),web=await import(compile("app/work-schedule/work-log/actions.ts",{...base,"@/lib/work-log-mutations":mutations,"@/lib/work-log-cache":cache}));
const root=await import(compile("app/api/mobile/work-logs/route.ts",{"@/lib/mobile-work-logs":adapter})),dateRoute=await import(compile("app/api/mobile/work-logs/[date]/route.ts",{"@/lib/mobile-work-logs":adapter}));
function signedIn(){h.session={userId:employee.id,user:structuredClone(employee),expiresAt:new Date(Date.now()+60000)};}
function request(path="",method="GET",body?:unknown,headers:Row={}){return new Request(`https://fixture.invalid/api/mobile/work-logs${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(method!=="GET"?{"Content-Type":"application/json"}:{}),...headers},...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)})});}
const values=(overrides:Row={})=>({workDate:today,keyword:"업무",content:"내용\n후속조치",manualLogId:null,expectedUpdatedAt:"",...overrides});
const context=(date=today)=>({params:Promise.resolve({date})});
const getDate=(date=today,path=`/${date}`)=>dateRoute.GET(request(path),context(date));
const save=(overrides:Row={})=>root.POST(request("","POST",values(overrides)));
const remove=(id:string,expectedUpdatedAt:string,date=today)=>dateRoute.DELETE(request(`/${date}`,"DELETE",{manualLogId:id,expectedUpdatedAt}),context(date));
function seedLog(overrides:Row={}){const row={id:`manual-${++h.nextId}`,authorId:employee.id,workDate:new Date(today+"T00:00:00Z"),keyword:"saved",content:"saved private text",createdAt:new Date("2026-01-01T00:00:00Z"),updatedAt:new Date("2026-01-01T01:00:00Z"),updatedById:null,...overrides};h.logs.push(row);return row;}
function task(overrides:Row={}){const row={id:`task-${h.tasks.length}`,title:"완료업무",description:null,meetingTitle:null,assigneeId:employee.id,assignee:{name:employee.name},completedAt:new Date(today+"T01:00:00Z"),deletedAt:null,...overrides};h.tasks.push(row);return row;}
function schedule(youthOverrides:Row={}){h.schedules.push({id:`schedule-${h.schedules.length}`,content:"참고일정",startMinute:540,endMinute:600,occurrenceDates:[today],youthId:`youth-${h.schedules.length}`,youth:{name:"청소년",dischargeDate:null,actualDischargeDate:null,purgeStartedAt:null,purgedAt:null,...youthOverrides}});}
function meeting(overrides:Row={}){const schema=getMeetingMinutesDocumentTemplateSchema();const row={id:`meeting-${h.documents.length}`,title:"회의록",documentNo:null,templateId:"template-meeting-minutes",template:{schema},status:"APPROVED",drafterId:employee.id,drafter:{name:employee.name},approvalSteps:[],discardedAt:null,content:compileDocumentTemplateContent(schema,{meetingTitle:"운영회의",meetingDate:today,location:"회의실",attendees:"직원",host:"진행",agenda:"안건",discussion:"PRIVATE_DISCUSSION"}),createdAt:new Date(),updatedAt:new Date(),completedAt:new Date(),attachments:[{id:"file",originalName:"회의록.pdf",mimeType:"application/pdf",size:123,createdAt:new Date(),signedAt:null,signedSourceAttachmentId:null,storageKey:"PRIVATE_STORAGE"}],...overrides};h.documents.push(row);return row;}
const privateJson=(response:Response)=>{assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("pragma"),"no-cache");assert.equal(response.headers.get("location"),null);};
beforeEach(()=>{Object.assign(h,{logs:[],users:structuredClone([employee,other]),tasks:[],documents:[],schedules:[],audits:[],reads:[],transactions:[],invalidated:[],auditFailure:false,taskFailure:false,meetingFailure:false,scheduleFailure:false,deleteRace:false,txErrors:0,beforeTx:null,cacheFailure:false,nextId:0,txErrorCode:"P2034"});signedIn();});
after(()=>{delete(globalThis as Row)[key];});

test("all actual routes authenticate before query/body and return private JSON 401",async()=>{
 for(const session of [null,{...h.session,expiresAt:new Date(0)},{...h.session,user:{...employee,status:"INACTIVE"}}]){h.session=session;for(const call of [()=>root.GET(request("?bad=1")),()=>getDate("bad"),()=>save(),()=>remove("missing","bad")]){const response=await call();assert.equal(response.status,401);privateJson(response);assert.equal((await response.json()).code,"UNAUTHORIZED");}}
 signedIn();assert.equal((await root.GET(request("","GET",undefined,{Authorization:"bad"}))).status,401);assert.deepEqual(h.reads,[]);assert.deepEqual(h.audits,[]);
});
test("fresh ACTIVE actor only; ADMIN/director employment dates never broaden own scope",async()=>{
 seedLog({authorId:other.id,keyword:"PRIVATE_OTHER"});task({assigneeId:other.id});meeting({drafterId:other.id,title:"PRIVATE_DOCUMENT"});
 const payload=await(await root.GET(request())).json();assert.equal(payload.userName,employee.name);assert.deepEqual(payload.recentLogs,[]);assert.doesNotMatch(JSON.stringify(payload),/PRIVATE|auto:|tasks:employee/);
 h.users[0].status="INACTIVE";assert.equal((await getDate()).status,401);assert.equal((await save()).status,401);
 h.users[0].status="ACTIVE";h.beforeTx=()=>{h.users[0].status="INACTIVE";};assert.equal((await save()).status,401);assert.equal(h.logs.length,1);assert.equal(h.logs[0].authorId,other.id);
});
test("strict date/query including absent vs empty, leap day, future, duplicate, injection",async()=>{
 for(const path of ["?date=","?date=2026-02-30","?date=9999-01-01","?date=2024-02-29&date=2024-02-29","?authorId=other"]){const response=await root.GET(request(path));assert.equal(response.status,400);privateJson(response);}
 assert.equal((await getDate("2024-02-29")).status,200);assert.equal((await getDate(today,`/${today}?date=${today}`)).status,400);
 assert.equal((await getDate("2026-2-01")).status,400);assert.equal((await root.POST(request("?role=ADMIN","POST",values()))).status,400);assert.deepEqual(h.logs,[]);
});
test("empty day nullable 200 and selected historical data beyond recent/contribution windows",async()=>{
 const empty=await(await getDate()).json();assert.equal(empty.entry,null);assert.deepEqual(empty.linkedScheduleState,{status:"ready",schedules:[]});
 const old=seedLog({workDate:new Date("2020-01-01T00:00:00Z")});const payload=await(await root.GET(request("?date=2020-01-01"))).json();assert.equal(payload.selectedEntry.manualLogId,old.id);assert.deepEqual(payload.contributionDates,[]);
 assert.ok(h.transactions.every((options:Row)=>options.isolationLevel==="RepeatableRead"));
});
test("minimal mixed DTO and recent metadata, USER meeting ACL even ADMIN, current own task only",async()=>{
 const manual=seedLog();task();task({assigneeId:other.id,title:"PRIVATE_TASK"});task({deletedAt:new Date(),title:"PRIVATE_DELETED"});meeting();meeting({drafterId:other.id,title:"PRIVATE_OTHER"});
 const response=await root.GET(request());privateJson(response);const payload=await response.json(),entry=payload.selectedEntry;
 assert.equal(entry.id,today);assert.equal(entry.manualLogId,manual.id);assert.equal(entry.completedTasks.length,1);assert.equal(entry.meetingDocuments.length,1);assert.equal(entry.meetingDocuments[0].attachments[0].previewKind,"pdf");
 assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_TASK|PRIVATE_OTHER|PRIVATE_DELETED|PRIVATE_STORAGE|PRIVATE_DISCUSSION|passwordHash|storageKey|auto:/);
 assert.equal(payload.recentLogs[0].completedTaskCount,1);assert.equal(payload.recentLogs[0].meetingAttachmentCount,1);assert.ok(!Object.hasOwn(payload.recentLogs[0],"content"));assert.ok(!Object.hasOwn(payload.recentLogs[0],"completedTasks"));
 assert.ok(h.reads.filter((row:Row)=>row.model==="user").every((row:Row)=>!row.select.role&&!row.select.passwordHash));
});
test("many tasks share one of twelve distinct recent days; KST boundary and pending/deleted isolation",async()=>{
 for(let day=1;day<=15;day++)for(let n=0;n<(day===15?30:1);n++)task({completedAt:new Date(`2026-08-${String(day).padStart(2,"0")}T01:00:00Z`)});
 task({completedAt:null});const payload=await(await root.GET(request())).json();assert.equal(payload.recentLogs.length,12);assert.equal(payload.recentLogs[0].workDate,"2026-08-15");assert.equal(payload.recentLogs[0].completedTaskCount,30);
 h.tasks=[];task({completedAt:new Date("2026-08-31T15:00:00Z")});assert.equal((await(await getDate("2026-09-01")).json()).entry.completedTasks.length,1);assert.equal((await(await getDate("2026-08-31")).json()).entry,null);
 const {startDate}=getWorkLogContributionRange(today);seedLog({workDate:new Date(startDate+"T00:00:00Z")});assert.ok((await(await root.GET(request())).json()).contributionDates.includes(startDate));
});
test("current operational AND report day schedule scope excludes discharge/purge; never rewrites manual text",async()=>{
 seedLog({content:"본인 자유서술은 보존"});schedule();for(const fields of [{actualDischargeDate:today},{purgeStartedAt:new Date()},{purgedAt:new Date()},{dischargeDate:"2000-01-01"}])schedule(fields);
 const payload=await(await getDate()).json();assert.equal(payload.linkedScheduleState.schedules.length,1);assert.equal(payload.entry.content,"본인 자유서술은 보존");
 h.scheduleFailure=true;const partial=await getDate();assert.equal(partial.status,200);assert.deepEqual((await partial.json()).linkedScheduleState,{status:"error"});assert.ok(h.reads.some((r:Row)=>r.command==="ROLLBACK TO SAVEPOINT work_log_optional_schedules"));
 assert.equal((await save({manualLogId:h.logs[0].id,expectedUpdatedAt:h.logs[0].updatedAt.toISOString()})).status,200);
});
test("mandatory task/meeting failure reports 503 rather than partial success",async()=>{
 seedLog();for(const key of ["taskFailure","meetingFailure"]){h[key]=true;const response=await root.GET(request());assert.equal(response.status,503);privateJson(response);assert.equal((await response.json()).code,"LOAD_FAILED");h[key]=false;}
});
test("strict body limits/types/token pairing reuse web normalization and exact valid 100/5000 Unicode limits",async()=>{
 for(const overrides of [{manualLogId:undefined},{manualLogId:42},{manualLogId:null,expectedUpdatedAt:new Date().toISOString()},{manualLogId:"id",expectedUpdatedAt:""},{keyword:" "},{content:null},{keyword:"x".repeat(101)},{content:"x".repeat(5001)},{authorId:other.id},{workDate:` ${today} `}]){const response=await save(overrides);assert.equal(response.status,400);privateJson(response);}
 const response=await save({keyword:" 가 ",content:" 본문\n 다음 "});assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.entry.keyword,"가");assert.equal(payload.entry.content,"본문\n 다음");
 assert.equal(core.parseMobileWorkLogSave(values({keyword:"가".repeat(100),content:"😀".repeat(2500)}),today).values.content.length,5000);
 for(const input of [null,[],{...values(),content:[]},{...values(),expectedUpdatedAt:{}}])assert.throws(()=>core.parseMobileWorkLogSave(input,today));
});
test("bounded JSON rejects declared/actual cap, forged size, fatal UTF8 and malformed JSON before writes",async()=>{
 for(const req of [request("","POST",values(),{"Content-Length":"65537"}),request("","POST","x".repeat(65537)),request("","POST",values(),{"Content-Length":"1"}),request("","POST",values(),{"Content-Length":"-1"}),request("","POST","{"),request("","POST",values(),{"Content-Type":"text/plain"})]){const response=await root.POST(req);assert.ok([400,413].includes(response.status));privateJson(response);}
 const invalid=new Request("https://fixture.invalid/api/mobile/work-logs",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:new Uint8Array([0xff])});assert.equal((await root.POST(invalid)).status,400);assert.deepEqual(h.logs,[]);
 const escaped=JSON.stringify(values({keyword:"가".repeat(100),content:"한".repeat(5000)})).replace(/[가한]/g,c=>`\\u${c.charCodeAt(0).toString(16)}`);assert.equal((await root.POST(request("","POST",escaped))).status,200);
});
test("stream read has ten-second whole-body deadline before any write",async()=>{
 const original=globalThis.setTimeout;globalThis.setTimeout=((fn:()=>void)=>original(fn,1)) as typeof setTimeout;
 try{const request=new Request("https://fixture.invalid/api/mobile/work-logs",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:new ReadableStream({pull(){return new Promise(()=>{});}}),duplex:"half"} as RequestInit);const response=await root.POST(request);assert.equal(response.status,408);assert.equal((await response.json()).code,"REQUEST_TIMEOUT");assert.deepEqual(h.logs,[]);}finally{globalThis.setTimeout=original;}
});
test("create natural key, audit once; stale identical no-op conflicts before equality",async()=>{
 const created=await(await save()).json();assert.equal(created.change,"create");assert.equal(h.logs.length,1);assert.equal(h.audits.length,1);assert.equal(h.audits[0].metadata.changeType,"workLog.create");
 const stale=await save();assert.equal(stale.status,409);assert.equal((await stale.json()).currentUpdatedAt,created.entry.manualUpdatedAt);
 const fresh={manualLogId:created.entry.manualLogId,expectedUpdatedAt:created.entry.manualUpdatedAt};const unchanged=await(await save(fresh)).json();assert.equal(unchanged.change,"unchanged");assert.equal(h.audits.length,1);assert.equal(h.invalidated.length,1);
 task();assert.equal((await(await save(fresh)).json()).entry.completedTasks.length,1);assert.equal(h.logs[0].updatedAt.toISOString(),created.entry.manualUpdatedAt);
});
test("monotonic timestamp fixed/retrograde clock, mobile ID+time ABA protection, web timestamp-only compatibility",async()=>{
 const row=seedLog();const ctx={actor:employee,db,client:"mobile",today,now:()=>new Date(0)};
 const updated=await domain.saveOwnWorkLog(ctx,{values:{workDate:today,keyword:"new",content:"new"},manualLogId:row.id,expectedUpdatedAt:row.updatedAt.toISOString()});assert.equal(new Date(updated.entry.manualUpdatedAt).getTime(),new Date("2026-01-01T01:00:00Z").getTime()+1);
 const oldToken=updated.entry.manualUpdatedAt;h.logs=[];const replacement=seedLog({updatedAt:new Date(oldToken),keyword:"new",content:"new"});assert.notEqual(replacement.id,row.id);
 const stale=await save({keyword:"new",content:"new",manualLogId:row.id,expectedUpdatedAt:oldToken});assert.equal(stale.status,409);assert.equal(h.logs[0].id,replacement.id);
 await assert.rejects(domain.saveOwnWorkLog(ctx,{values:{workDate:today,keyword:"x",content:"x"},expectedUpdatedAt:oldToken}),(error:Row)=>error.code==="INVALID_REQUEST");
 const webForm=new FormData();for(const [key,value]of Object.entries({workDate:today,keyword:"web",content:"web",expectedUpdatedAt:oldToken}))webForm.set(key,value);const result=await web.saveWorkLogAction({},webForm);assert.equal(result.success,"업무일지를 수정했습니다.");assert.equal(h.logs[0].id,replacement.id);
});
test("manual delete leaves automatic task/meeting rows, own-date projection and private missing/foreign/wrong-date idempotence",async()=>{
 const row=seedLog();task();meeting();const response=await remove(row.id,row.updatedAt.toISOString());assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.change,"deleted");assert.equal(payload.entry.manualLogId,null);assert.equal(payload.entry.completedTasks.length,1);assert.equal(payload.entry.meetingDocuments.length,1);assert.equal(h.tasks.length,1);assert.equal(h.documents.length,1);
 const replacement=seedLog();for(const id of [row.id,"missing",seedLog({authorId:other.id}).id]){const missing=await remove(id,row.updatedAt.toISOString());assert.equal(missing.status,200);assert.equal((await missing.json()).entry.manualLogId,replacement.id);}
 assert.equal((await(await remove(replacement.id,replacement.updatedAt.toISOString(),"2024-01-01")).json()).change,"missing");assert.equal(h.audits.length,1);
 assert.ok(!Object.hasOwn(h.audits[0].metadata.previous,"content"));
});
test("stale delete conflicts, conditional delete race retries bounded and preserves row",async()=>{
 const row=seedLog();assert.equal((await remove(row.id,new Date(0).toISOString())).status,409);assert.equal(h.logs.length,1);
 h.deleteRace=true;const before=h.transactions.length;assert.equal((await remove(row.id,row.updatedAt.toISOString())).status,500);assert.equal(h.transactions.length-before,3);assert.equal(h.logs.length,1);assert.equal(h.audits.length,0);
});
test("audit/mandatory projection failures roll back create/update/delete; cache failure after commit remains success",async()=>{
 h.auditFailure=true;assert.equal((await save()).status,500);assert.deepEqual(h.logs,[]);h.auditFailure=false;
 const row=structuredClone(seedLog());for(const flag of ["auditFailure","taskFailure","meetingFailure"]){h[flag]=true;assert.equal((await save({manualLogId:row.id,expectedUpdatedAt:row.updatedAt.toISOString()})).status,500);assert.equal(h.logs[0].content,row.content);assert.equal((await remove(row.id,row.updatedAt.toISOString())).status,500);assert.equal(h.logs.length,1);assert.deepEqual(h.audits,[]);h[flag]=false;}
 h.cacheFailure=true;const response=await save({manualLogId:row.id,expectedUpdatedAt:row.updatedAt.toISOString()});assert.equal(response.status,200);assert.equal(h.audits.length,1);assert.equal(h.logs.length,1);
});
test("retryable serialization errors retry <=3 with one committed audit",async()=>{
 h.txErrors=2;assert.equal((await save()).status,200);assert.equal(h.transactions.length,3);assert.equal(h.audits.length,1);assert.ok(h.transactions.every((v:Row)=>v.isolationLevel==="Serializable"));
 h.logs=[];h.audits=[];h.txErrors=3;assert.equal((await save()).status,500);assert.deepEqual(h.logs,[]);assert.deepEqual(h.audits,[]);
});
test("actual web wrappers preserve fields, Korean success/conflict/delete and unchanged cache policy",async()=>{
 const form=new FormData();form.set("workDate",today);form.set("keyword","  업무  ");form.set("content","내용");const saved=await web.saveWorkLogAction({},form);assert.equal(saved.success,"업무일지를 등록했습니다.");assert.equal(saved.values.keyword,"업무");
 const stale=await web.saveWorkLogAction({},form);assert.ok(stale.conflictUpdatedAt);assert.match(stale.error,/현재 입력은 유지/);form.set("expectedUpdatedAt",saved.entry.manualUpdatedAt);const before=h.invalidated.length;assert.equal((await web.saveWorkLogAction({},form)).success,"변경된 내용이 없습니다.");assert.equal(h.invalidated.length,before);
 form.set("keyword"," ");assert.ok((await web.saveWorkLogAction({},form)).fieldErrors.keyword);
 const deletion=new FormData();deletion.set("workLogId",saved.entry.manualLogId);deletion.set("expectedUpdatedAt",new Date(0).toISOString());assert.equal((await web.deleteWorkLogAction({},deletion)).conflict,true);deletion.set("expectedUpdatedAt",saved.entry.manualUpdatedAt);assert.equal((await web.deleteWorkLogAction({},deletion)).success,"업무일지를 삭제했습니다.");assert.equal((await web.deleteWorkLogAction({},deletion)).success,"업무일지가 이미 삭제되었습니다.");
});

test("P2002 concurrent natural-key creation retries into authoritative conflict without second row/audit",async()=>{
 h.txErrors=1;h.txErrorCode="P2002";let winner:Row|null=null;
 h.beforeTx=()=>{if(!winner)winner=seedLog({keyword:"다른 창의 등록",content:"먼저 저장된 내용"});};
 const response=await save();assert.equal(response.status,409);const payload=await response.json();
 assert.equal(payload.code,"WORK_LOG_CONFLICT");assert.equal(payload.currentUpdatedAt,winner!.updatedAt.toISOString());
 assert.equal(h.logs.length,1);assert.equal(h.logs[0].keyword,"다른 창의 등록");assert.deepEqual(h.audits,[]);assert.equal(h.transactions.length,2);
});
