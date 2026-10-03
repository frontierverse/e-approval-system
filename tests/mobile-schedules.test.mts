import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { Prisma } from "../src/generated/prisma/client.ts";
import { DriverAdapterError } from "@prisma/driver-adapter-utils";
import { getWorkScheduleMonthRange, getWorkScheduleMonthDates, getWorkScheduleWeekday, isWorkScheduleDate } from "../src/lib/work-schedule-calendar.ts";
import { getKoreanDateValue } from "../src/lib/document-archive-policy.ts";

// Real auth, source queries, parser, mutation domain, HTTP routes and web wrappers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const employee={id:"employee",name:"직원",role:"USER",status:"ACTIVE",position:{name:"담당"},passwordHash:"PRIVATE_PASSWORD",email:"PRIVATE_EMAIL"};
const today=getKoreanDateValue(), token="t".repeat(43);
const h:Row={};
const eq=(a:unknown,b:unknown)=>a instanceof Date&&b instanceof Date?a.getTime()===b.getTime():a===b;
function matches(row:Row,where:Row={}):boolean{return Object.entries(where).every(([key,value])=>{
 if(key==="AND")return(Array.isArray(value)?value:[value]).every((part:Row)=>matches(row,part));
 if(key==="OR")return value.some((part:Row)=>matches(row,part));
 if(key==="scheduleDate_startMinute")return matches(row,value);
 const current=row[key];if(value===null||value instanceof Date||typeof value!=="object")return eq(current,value);
 if("path"in value)return eq(value.path.reduce((v:Row,k:string)=>v?.[k],current),value.equals);
 if("not"in value&&eq(current,value.not))return false;
 if("gte"in value&&!(current!=null&&current>=value.gte))return false;
 if("lt"in value&&!(current!=null&&current<value.lt))return false;
 if("gt"in value&&!(current!=null&&current>value.gt))return false;
 if("hasSome"in value&&!value.hasSome.some((v:unknown)=>(current??[]).includes(v)))return false;
 if("contains"in value&&!String(current).includes(value.contains))return false;
 if("is"in value)return current!=null&&matches(current,value.is);
 return true;
});}
function project(row:Row,select?:Row):Row{if(!select)return structuredClone(row);return Object.fromEntries(Object.entries(select).filter(([,yes])=>yes).map(([k,s])=>[k,s===true?structuredClone(row[k]):row[k]==null?row[k]:project(row[k],s.select)]));}
function findMany(rows:Row[],args:Row):Row[]{let found=rows.filter(row=>matches(row,args.where));const orders=Array.isArray(args.orderBy)?args.orderBy:[args.orderBy??{}];found.sort((a,b)=>{for(const order of orders)for(const[k,dir]of Object.entries(order)){const cmp=a[k]<b[k]?-1:a[k]>b[k]?1:0;if(cmp)return dir==="desc"?-cmp:cmp;}return 0;});if(args.distinct)found=found.filter((row,index)=>found.findIndex(other=>args.distinct.every((k:string)=>other[k]===row[k]))===index);return found.slice(args.skip??0,args.take===undefined?undefined:(args.skip??0)+args.take).map(row=>project(row,args.select));}
function read(model:string,args:Row){h.reads.push({model,...args,snapshot:h.snapshot});if(h[model+"Failure"])throw Error("PRIVATE_FAILURE");}
function schemaData(data:Row){for(const key of Object.keys(data))assert.ok(["scheduleDate","weekday","startHour","startMinute","endHour","endMinute","content","updatedAt"].includes(key),`unexpected WorkSchedule data field: ${key}`);}
const db={
 mobileSession:{async findUnique(){return h.session;}},
 user:{async findUnique(args:Row){read("user",args);const row=h.users.find((r:Row)=>matches(r,args.where));return row?project(row,args.select):null;}},
 workSchedule:{
  async findUnique(args:Row){read("workSchedule",args);const row=h.schedules.find((r:Row)=>matches(r,args.where));return row?project(row,args.select):null;},
  async findUniqueOrThrow(args:Row){const row=await this.findUnique(args);if(!row)throw Error("missing");return row;},
  async findMany(args:Row){read("workSchedule",args);return findMany(h.schedules,args);},
  async findFirst(args:Row){read("workSchedule",args);return findMany(h.schedules,{...args,take:1})[0]??null;},
  async create(args:Row){schemaData(args.data);if(h.schedules.some((r:Row)=>r.scheduleDate===args.data.scheduleDate&&r.startMinute===args.data.startMinute))throw new Prisma.PrismaClientKnownRequestError("duplicate",{code:"P2002",clientVersion:"fixture"});const row={id:`manual-${++h.nextId}`,createdAt:new Date(),...structuredClone(args.data)};h.schedules.push(row);return project(row,args.select);},
  async updateMany(args:Row){schemaData(args.data);if(h.updateRace)return{count:0};const rows=h.schedules.filter((r:Row)=>matches(r,args.where));rows.forEach((r:Row)=>Object.assign(r,structuredClone(args.data)));return{count:rows.length};},
  async deleteMany(args:Row){if(h.deleteRace)return{count:0};const old=h.schedules.length;h.schedules=h.schedules.filter((r:Row)=>!matches(r,args.where));return{count:old-h.schedules.length};},
 },
 approvalDocument:{async findMany(args:Row){read("approvalDocument",args);return findMany(h.documents,args);}},
 youthPersonalSchedule:{async findMany(args:Row){read("youthPersonalSchedule",args);return findMany(h.appointments,args);}},
 auditLog:{
  async create({data}:Row){if(h.auditFailure)throw Error("PRIVATE_AUDIT_FAILURE");const row={id:`audit-${++h.nextAudit}`,createdAt:new Date(),actor:h.users.find((r:Row)=>r.id===data.actorId),...structuredClone(data)};h.audits.push(row);return row;},
  async count(args:Row){read("auditLog",args);return h.audits.filter((r:Row)=>matches(r,args.where)).length;},
  async findMany(args:Row){read("auditLog",args);return findMany(h.audits,args);},
 },
 async $transaction(operation:(client:Row)=>Promise<unknown>,options:Row){h.transactions.push(options);h.beforeTx?.();const failure=h.txErrors-->0?(h.txErrorFactory?.()??new Prisma.PrismaClientKnownRequestError("retry",{code:h.txErrorCode,clientVersion:"fixture"})):null;if(failure&&!h.txErrorAtCommit)throw failure;const before=structuredClone({schedules:h.schedules,audits:h.audits});h.snapshot++;try{const result=await operation({...db});if(failure)throw failure;return result;}catch(error){Object.assign(h,before);throw error;}},
};
const key="__mobileSchedulesHarness";(globalThis as Row)[key]={h,db};
const url=(source:string)=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mocks=url(`const {h,db}=globalThis.${key};export const prisma=db;export async function requireUser(){return h.session.user;}export async function getCurrentAuditLogRequestData(){return {ipAddress:'PRIVATE_IP'};}export function getAuditLogRequestData(){return {ipAddress:'PRIVATE_IP'};}export function revalidatePath(path){if(h.cacheFailure)throw Error('cache');h.invalidated.push(path);}export function logServerEvent(){}export function getSafeErrorDigest(){return 'safe';}`);
function compile(file:string,aliases:Record<string,string>){let source=readFileSync(new URL(`../src/${file}`,import.meta.url),"utf8");for(const[from,to]of Object.entries(aliases))source=source.replaceAll(`"${from}"`,JSON.stringify(to));return url(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
const base={"@/lib/prisma":mocks,"@/lib/audit-log-request":mocks,"next/cache":mocks,"@/lib/auth":mocks,"@/lib/observability":mocks};
const vacations=compile("lib/staff-vacations.ts",base),queries=compile("lib/work-schedules.ts",{...base,"@/lib/staff-vacations":vacations});
const mutations=compile("lib/work-schedule-mutations.ts",{...base,"@/lib/work-schedules":queries}),cache=compile("lib/work-schedule-cache.ts",base),auth=compile("lib/mobile-auth.ts",base);
const adapter=compile("lib/mobile-schedules.ts",{...base,"@/lib/work-schedules":queries,"@/lib/work-schedule-mutations":mutations,"@/lib/work-schedule-cache":cache,"@/lib/mobile-auth":auth});
const core=await import(compile("lib/mobile-schedules-core.ts",{})),domain=await import(mutations),web=await import(compile("app/work-schedule/actions.ts",{...base,"@/lib/work-schedules":queries,"@/lib/work-schedule-mutations":mutations,"@/lib/work-schedule-cache":cache}));
const root=await import(compile("app/api/mobile/schedules/route.ts",{"@/lib/mobile-schedules":adapter})),manual=await import(compile("app/api/mobile/schedules/manual/[id]/route.ts",{"@/lib/mobile-schedules":adapter})),changes=await import(compile("app/api/mobile/schedules/changes/route.ts",{"@/lib/mobile-schedules":adapter}));
function signIn(){h.session={userId:employee.id,user:structuredClone(h.users[0]),expiresAt:new Date(Date.now()+60000)};}
function request(path="",method="GET",body?:unknown,headers:Row={}){return new Request(`https://fixture.invalid/api/mobile/schedules${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(method!=="GET"?{"Content-Type":"application/json"}:{}),...headers},...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)})});}
const values=(extra:Row={})=>({scheduleDate:today,startMinute:540,endMinute:600,content:"일정",manualScheduleId:null,expectedUpdatedAt:"",...extra});
const create=(extra:Row={})=>root.POST(request("","POST",values(extra)));
const context=(id:string)=>({params:Promise.resolve({id})});
const get=(id:string,path=`/manual/${id}`)=>manual.GET(request(path),context(id));
const update=(row:Row,extra:Row={})=>{const data=values({expectedUpdatedAt:row.updatedAt instanceof Date?row.updatedAt.toISOString():row.updatedAt,...extra});delete data.manualScheduleId;return manual.PUT(request(`/manual/${row.id}`,"PUT",data),context(row.id));};
const remove=(id:string,expectedUpdatedAt:string)=>manual.DELETE(request(`/manual/${id}`,"DELETE",{expectedUpdatedAt}),context(id));
function seed(extra:Row={}){const row={id:`manual-${++h.nextId}`,scheduleDate:today,startMinute:540,endMinute:600,startHour:9,endHour:10,weekday:1,content:"보존 내용",createdAt:new Date(0),updatedAt:new Date("2026-01-01T00:00:00Z"),...extra};h.schedules.push(row);return row;}
function appointment(youthExtra:Row={},extra:Row={}){h.appointments.push({id:`hospital-${h.appointments.length}`,scheduleType:"HOSPITAL",occurrenceDates:[today],startMinute:480,endMinute:500,hospitalName:"병원",escortName:"인솔자",content:"PRIVATE_APPOINTMENT",nextAppointmentDate:today,youth:{name:"청소년",dischargeDate:null,actualDischargeDate:null,purgeStartedAt:null,purgedAt:null,...youthExtra},...extra});}
function vacation(extra:Row={}){h.documents.push({id:"vacation",templateId:"template-vacation-request",status:"APPROVED",createdAt:new Date(0),completedAt:new Date(0),content:`연차 ${today} PRIVATE_REASON`,template:{name:"휴가",schema:{}},drafter:{id:"other",name:"다른 직원",department:{name:"부서"},position:{name:"직급"}},attachments:[{storageKey:"PRIVATE_STORAGE"}],...extra});}
function privateJson(response:Response){assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("pragma"),"no-cache");assert.equal(response.headers.get("location"),null);}
beforeEach(()=>{Object.assign(h,{users:structuredClone([employee,{...employee,id:"other"}]),schedules:[],documents:[],appointments:[],audits:[],reads:[],transactions:[],invalidated:[],nextId:0,nextAudit:0,snapshot:0,auditFailure:false,cacheFailure:false,workScheduleFailure:false,approvalDocumentFailure:false,youthPersonalScheduleFailure:false,updateRace:false,deleteRace:false,txErrors:0,txErrorCode:"P2034",txErrorFactory:null,txErrorAtCommit:false,beforeTx:null});signIn();});
after(()=>{delete(globalThis as Row)[key];});

test("actual routes authenticate before invalid IDs/query/body and always private JSON",async()=>{
 for(const session of [null,{...h.session,expiresAt:new Date(0)},{...h.session,user:{...employee,status:"INACTIVE"}}]){h.session=session;for(const call of [()=>root.GET(request("?bad=1")),()=>create(),()=>get("approved-vacation:bad"),()=>update({id:"bad",updatedAt:"bad"}),()=>remove("bad","bad"),()=>changes.GET(request("/changes?page=bad"))]){const response=await call();assert.equal(response.status,401);privateJson(response);assert.equal((await response.json()).code,"UNAUTHORIZED");}}
 signIn();assert.equal((await root.GET(request("","GET",undefined,{Authorization:"bad"}))).status,401);assert.deepEqual(h.reads,[]);assert.deepEqual(h.audits,[]);
});
test("all ACTIVE roles share manual rows; fresh deactivation prevents snapshot and mutation",async()=>{
 const row=seed();for(const role of ["USER","ADMIN"]){h.users[0].role=role;signIn();assert.equal((await get(row.id)).status,200);}
 h.users[0].position={name:"시설장"};signIn();assert.equal((await update(row,{content:"시설장 수정"})).status,200);
 h.users[0].status="INACTIVE";assert.equal((await root.GET(request())).status,401);assert.equal((await create({startMinute:600,endMinute:650})).status,401);
 h.users[0].status="ACTIVE";h.beforeTx=()=>{h.users[0].status="INACTIVE";};assert.equal((await create({startMinute:600,endMinute:650})).status,401);assert.equal(h.schedules.length,1);
});
test("strict canonical month/date defaults allow future, reject empty/duplicates/unknown/mismatch",async()=>{
 const defaults=await(await root.GET(request())).json();assert.equal(defaults.selectedDate,today);assert.equal(defaults.month,today.slice(0,7));
 assert.equal((await(await root.GET(request("?date=2100-01-02"))).json()).month,"2100-01");assert.equal((await(await root.GET(request("?month=2100-01"))).json()).selectedDate,"2100-01-01");
 for(const path of ["?date=","?month=","?month=2026-13","?date=2026-02-30","?date=2026-1-01","?month=2026-01&date=2026-02-01","?date=2024-02-29&date=2024-02-29","?role=ADMIN"]){assert.equal((await root.GET(request(path))).status,400);}
 assert.equal((await root.GET(request("?date=2024-02-29"))).status,200);assert.equal((await get("bad:id")).status,400);assert.equal((await get("missing")).status,404);assert.equal((await get("id","/manual/id?date=")).status,400);
});
test("actual canonical low/final year ranges stay in one month, including hospital occurrences",async()=>{
 for(const [month,end]of [["0001-01","0001-02-01"],["0099-12","0100-01-01"],["0100-01","0100-02-01"],["0999-12","1000-01-01"],["9999-12","9999-12-32"]]){
  h.schedules=[];h.appointments=[];h.documents=[];const date=month+"-01",last=getWorkScheduleMonthDates(month).at(-1)!;
  seed({scheduleDate:date});seed({scheduleDate:last,startMinute:600,endMinute:650});seed({scheduleDate:"2026-01-01",content:"PRIVATE_OUTSIDE_MONTH"});seed({scheduleDate:month==="9999-12"?"9999-11-01":"0999-11-01",content:"PRIVATE_OTHER_CENTURY"});
  assert.deepEqual(getWorkScheduleMonthRange(month),{startDate:date,endDate:end});assert.equal(getWorkScheduleMonthDates(month).length,31);
  appointment({}, {occurrenceDates:[date]});const response=await root.GET(request(`?month=${month}&date=${date}`));assert.equal(response.status,200);const data=await response.json();assert.equal(data.items.length,3);assert.ok(data.items.every((row:Row)=>row.scheduleDate.slice(0,7)===month));assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);
  const lastQuery=h.reads.filter((r:Row)=>r.model==="workSchedule").at(-1);assert.deepEqual(lastQuery.where.scheduleDate,{gte:date,lt:end});
  h.schedules=[];const created=await create({scheduleDate:date});assert.equal(created.status,200);assert.equal(h.schedules[0].weekday,getWorkScheduleWeekday(date));
 }
 assert.equal(getWorkScheduleWeekday("0001-01-01"),1);assert.ok(isWorkScheduleDate("0004-02-29"));assert.ok(!isWorkScheduleDate("0100-02-29"));assert.ok(!isWorkScheduleDate("0000-01-01"));
 for(const path of ["?month=0000-01","?month=10000-01","?date=0000-01-01","?date=10000-01-01"])assert.equal((await root.GET(request(path))).status,400);
});
test("mixed safe metadata, all-day stable order/counts, shared sources use one read snapshot",async()=>{
 seed();appointment();vacation();vacation({id:"draft",status:"DRAFT"});const response=await root.GET(request());privateJson(response);const data=await response.json();
 assert.equal(data.canManage,true);assert.deepEqual(data.monthCounts,{total:3,manual:1,vacation:1,hospital:1});assert.deepEqual(data.selectedCounts,data.monthCounts);assert.deepEqual(data.items.map((r:Row)=>r.sourceType),["approvedVacation","hospitalAppointment","manual"]);
 assert.ok(!Object.hasOwn(data.items[0],"startMinute"));assert.equal(data.items[0].staffName,"다른 직원");assert.equal(data.items[1].startMinute,480);assert.equal(data.items[2].updatedAt,h.schedules[0].updatedAt.toISOString());
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE_|passwordHash|email|profileImage|nextAppointment|sentinel/);
 const reads=h.reads.filter((r:Row)=>["user","workSchedule","approvalDocument","youthPersonalSchedule"].includes(r.model));assert.equal(new Set(reads.map((r:Row)=>r.snapshot)).size,1);assert.equal(h.transactions[0].isolationLevel,"RepeatableRead");
});
test("hospital selected-day AND current operational excludes retained/purging even historical month",async()=>{
 appointment();for(const youth of [{actualDischargeDate:today},{purgeStartedAt:new Date()},{purgedAt:new Date()},{dischargeDate:"2000-01-01"}])appointment(youth);appointment({dischargeDate:today},{occurrenceDates:["2100-01-01"]});
 assert.equal((await(await root.GET(request())).json()).items.length,1);assert.deepEqual((await(await root.GET(request("?month=2100-01"))).json()).items,[]);
 h.appointments=[];appointment({dischargeDate:"2026-10-01"},{occurrenceDates:["2026-09-01"]});assert.deepEqual((await(await root.GET(request("?month=2026-09"))).json()).items,[]);
});
test("any source failure returns safe 503 instead of a partially empty month",async()=>{for(const flag of ["workScheduleFailure","approvalDocumentFailure","youthPersonalScheduleFailure"]){h[flag]=true;const response=await root.GET(request());assert.equal(response.status,503);privateJson(response);assert.equal((await response.json()).code,"LOAD_FAILED");h[flag]=false;}});
test("strict body field/type/time/token checks; content beyond 5000 has no semantic cap",async()=>{
 for(const extra of [{manualScheduleId:undefined},{manualScheduleId:"id"},{expectedUpdatedAt:new Date().toISOString()},{scheduleDate:` ${today} `},{startMinute:"540"},{startMinute:539},{startMinute:550.5},{endMinute:540},{endMinute:1090},{content:" "},{content:null},{sourceType:"manual"},{role:"ADMIN"}])assert.equal((await create(extra)).status,400);
 const response=await create({content:"한".repeat(5001)});assert.equal(response.status,200);assert.equal((await response.json()).item.content.length,5001);assert.equal(h.schedules.length,1);
 for(const value of [null,[],{...values(),extra:1}])assert.throws(()=>core.parseMobileScheduleSave(value,true));
 assert.throws(()=>core.parseMobileScheduleDelete({expectedUpdatedAt:"2026-01-01"}));assert.throws(()=>core.parseMobileScheduleDelete({expectedUpdatedAt:new Date().toISOString(),role:"ADMIN"}));
});
test("8MiB actual/declared limit, size mismatch, malformed/fatal UTF8, type and whole-body timeout",async()=>{
 for(const req of [request("","POST",values(),{"Content-Length":"8388609"}),request("","POST","x".repeat(8388609)),request("","POST",values(),{"Content-Length":"1"}),request("","POST",values(),{"Content-Length":"-1"}),request("","POST","{"),request("","POST",values(),{"Content-Type":"text/plain"})]){const response=await root.POST(req);assert.ok([400,413].includes(response.status));privateJson(response);}
 const bad=new Request("https://fixture.invalid/api/mobile/schedules",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:new Uint8Array([255])});assert.equal((await root.POST(bad)).status,400);
 const original=globalThis.setTimeout;globalThis.setTimeout=((fn:()=>void)=>original(fn,1))as typeof setTimeout;try{const slow=new Request("https://fixture.invalid/api/mobile/schedules",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:new ReadableStream({pull(){return new Promise(()=>{});}}),duplex:"half"}as RequestInit);assert.equal((await root.POST(slow)).status,408);}finally{globalThis.setTimeout=original;}
 assert.deepEqual(h.schedules,[]);assert.deepEqual(h.audits,[]);
 const escaped=JSON.stringify(values({content:"한".repeat(5001)})).replace(/한/g,"\\uD55C");assert.equal((await root.POST(request("","POST",escaped))).status,200);
});
test("create, fresh unchanged no audit/cache; stale identical checks CAS before equality",async()=>{
 const result=await(await create()).json();assert.equal(result.change,"create");assert.equal(h.audits.length,1);const row=h.schedules[0],cacheCount=h.invalidated.length;
 assert.equal((await(await update(row)).json()).change,"unchanged");assert.equal(h.audits.length,1);assert.equal(h.invalidated.length,cacheCount);
 assert.equal((await update(row,{expectedUpdatedAt:new Date(0).toISOString()})).status,409);assert.equal(h.audits.length,1);
});
test("move keeps ID, monotonic timestamp even frozen clock and invalidates source+target months",async()=>{
 const row=structuredClone(seed({updatedAt:new Date("2099-01-01T00:00:00Z")}));const original=Date.now;Date.now=()=>0;try{const response=await update(row,{scheduleDate:"2100-01-01",content:"이동"});assert.equal(response.status,200);const item=(await response.json()).item;assert.equal(item.id,row.id);assert.equal(new Date(item.updatedAt).getTime(),row.updatedAt.getTime()+1);}finally{Date.now=original;}
 assert.equal((await(await get(row.id)).json()).item.scheduleDate,"2100-01-01");assert.ok(h.invalidated.includes(`/work-schedule?month=${today.slice(0,7)}`));assert.ok(h.invalidated.includes("/work-schedule?month=2100-01"));
});
test("manual overlap only, touching permitted, target conflict rolls back move",async()=>{
 const row=seed();appointment();vacation();assert.equal((await create({startMinute:550,endMinute:610})).status,409);assert.equal((await create({startMinute:600,endMinute:650})).status,200);
 assert.equal((await update(row,{startMinute:610,endMinute:660})).status,409);assert.equal(h.schedules[0].startMinute,540);assert.equal(h.audits.length,1);
 h.schedules=[];assert.equal((await create({startMinute:540,endMinute:550})).status,200);
});
test("DELETE repeats missing safely; old ID cannot alter same-slot same-token replacement",async()=>{
 const old=structuredClone(seed());assert.equal((await remove(old.id,new Date(0).toISOString())).status,409);assert.equal((await remove(old.id,old.updatedAt.toISOString())).status,200);
 const replacement=seed({updatedAt:old.updatedAt});const missing=await remove(old.id,old.updatedAt.toISOString());assert.equal((await missing.json()).change,"missing");assert.equal(h.schedules[0].id,replacement.id);
 assert.equal((await update(old)).status,404);const baseline={manualScheduleId:old.id,expectedUpdatedAt:old.updatedAt.toISOString()};assert.equal((await web.saveWorkScheduleAction(today,540,600,"old",today,540,baseline)).ok,false);assert.equal((await web.deleteWorkScheduleAction(today,540,baseline)).ok,true);assert.equal(h.schedules[0].id,replacement.id);
});
test("audit failures atomically roll back create/update/delete; cache failure preserves commit",async()=>{
 h.auditFailure=true;assert.equal((await create()).status,500);assert.deepEqual(h.schedules,[]);h.auditFailure=false;const old=structuredClone(seed());h.auditFailure=true;assert.equal((await update(old,{content:"change"})).status,500);assert.equal(h.schedules[0].content,old.content);assert.equal((await remove(old.id,old.updatedAt.toISOString())).status,500);assert.equal(h.schedules.length,1);assert.deepEqual(h.audits,[]);
 h.auditFailure=false;h.cacheFailure=true;assert.equal((await update(old,{content:"change"})).status,200);assert.equal(h.audits.length,1);
});
test("serialization/unique/conditional races retry three times with fresh checks and bounded conflict",async()=>{
 for(const code of ["P2034","P2002"]){h.txErrorCode=code;h.txErrors=2;const before=h.transactions.length;assert.equal((await create({startMinute:540+h.schedules.length*60,endMinute:600+h.schedules.length*60})).status,200);assert.equal(h.transactions.length-before,3);}
 const row=structuredClone(h.schedules[0]);for(const flag of ["updateRace","deleteRace"]){h[flag]=true;const before=h.transactions.length;const response=flag==="updateRace"?await update(row,{content:"new"}):await remove(row.id,row.updatedAt.toISOString());assert.equal(response.status,409);assert.equal((await response.json()).code,"SCHEDULE_CONFLICT");assert.equal(h.transactions.length-before,3);h[flag]=false;}
 h.txErrors=3;assert.equal((await create({startMinute:900,endMinute:950})).status,409);assert.equal(h.audits.length,2);assert.ok(h.transactions.every((v:Row)=>v.isolationLevel==="Serializable"));
});
test("actual pg adapter commit conflicts retry atomically, including wrapped Prisma adapter errors",async()=>{
 const adapter=()=>new DriverAdapterError({kind:"TransactionWriteConflict"});
 const factories=[adapter,()=>new Prisma.PrismaClientKnownRequestError("adapter",{code:"P2039",clientVersion:"7.10.0",meta:{driverAdapterError:adapter()}}),()=>new Error("transaction wrapper",{cause:new Error("inner wrapper",{cause:adapter()})})];
 for(const[index,factory]of factories.entries()){
  h.txErrorFactory=factory;h.txErrorAtCommit=true;h.txErrors=2;const before=h.transactions.length,minute=540+index*60;
  assert.equal((await create({startMinute:minute,endMinute:minute+50})).status,200);assert.equal(h.transactions.length-before,3);assert.equal(h.schedules.length,index+1);assert.equal(h.audits.length,index+1);
 }
 h.txErrorFactory=adapter;h.txErrors=3;const before=h.transactions.length;const response=await create({startMinute:900,endMinute:950});assert.equal(response.status,409);assert.equal((await response.json()).code,"SCHEDULE_CONFLICT");assert.equal(h.transactions.length-before,3);assert.equal(h.schedules.length,3);assert.equal(h.audits.length,3);
});
test("adapter conflict retry rechecks current actor after a rolled-back commit",async()=>{
 h.txErrorFactory=()=>new DriverAdapterError({kind:"TransactionWriteConflict"});h.txErrorAtCommit=true;h.txErrors=1;h.beforeTx=()=>{if(h.transactions.length===2)h.users[0].status="INACTIVE";};
 assert.equal((await create()).status,401);assert.equal(h.transactions.length,2);assert.deepEqual(h.schedules,[]);assert.deepEqual(h.audits,[]);
});
test("constraint, unknown, cyclic and overdeep adapter-looking errors are never retried",async()=>{
 const postgres=()=>new DriverAdapterError({kind:"postgres",code:"23514",severity:"ERROR",message:'violates check constraint "YouthPersonalSchedule_hospital_fields_check"',detail:undefined,column:undefined,hint:undefined});
 const cycle=()=>{const error=new Error("cycle");error.cause=error;return error;};
 const deep=()=>{let error:Error=new DriverAdapterError({kind:"TransactionWriteConflict"});for(let n=0;n<5;n++)error=new Error("wrapper",{cause:error});return error;};
 const factories=[postgres,()=>new Prisma.PrismaClientKnownRequestError("constraint",{code:"P2039",clientVersion:"7.10.0",meta:{driverAdapterError:postgres()}}),()=>new Error("TransactionWriteConflict"),()=>Object.assign(new Error("unrelated"),{code:"40001"}),()=>Object.assign(new Error("unrelated"),{kind:"TransactionWriteConflict"}),()=>new Error("unrelated",{cause:{name:"DriverAdapterError",cause:{kind:"TransactionWriteConflict"}}}),cycle,deep];
 for(const factory of factories){const failure=factory();h.txErrorFactory=()=>failure;h.txErrors=3;h.txErrorAtCommit=true;const before=h.transactions.length;
  await assert.rejects(domain.saveWorkSchedule({actorId:employee.id,client:"mobile",requestData:{}},values()),error=>error===failure);assert.equal(h.transactions.length-before,1);assert.deepEqual(h.schedules,[]);assert.deepEqual(h.audits,[]);
 }
});
test("actual domain retries uniqueness into latest overlap and web baseline detects a moved source",async()=>{
 let winner:Row|null=null;h.txErrors=1;h.txErrorCode="P2002";h.beforeTx=()=>{if(!winner)winner=seed();};
 const result=await domain.saveWorkSchedule({actorId:employee.id,client:"mobile",requestData:{}},values()).then(()=>null,(error:Row)=>error);assert.equal(result.code,"SCHEDULE_OVERLAP");assert.equal(h.schedules.length,1);assert.equal(h.audits.length,0);assert.equal(h.transactions.length,2);
 h.beforeTx=null;const row=h.schedules[0];await assert.rejects(domain.saveWorkSchedule({actorId:employee.id,client:"web",requestData:{}},values({content:"new"}),{scheduleDate:"2100-01-01",startMinute:540,baseline:{manualScheduleId:row.id,expectedUpdatedAt:row.updatedAt.toISOString()}}),(error:Row)=>error.code==="SCHEDULE_CONFLICT");
});
test("web legacy natural-key policy, new optional baseline, blank delete and same-content audit",async()=>{
 const first=await web.saveWorkScheduleAction(today,540,600," 원본 ");assert.equal(first.ok,true);assert.equal(first.data.schedule.content,"원본");const row=structuredClone(h.schedules[0]);assert.equal((await web.saveWorkScheduleAction(today,540,600,"원본")).ok,true);assert.equal(h.audits.length,2);
 assert.equal((await web.saveWorkScheduleAction(today,540,600,"stale",today,540,{manualScheduleId:row.id,expectedUpdatedAt:row.updatedAt.toISOString()})).ok,false);
 const fresh=h.schedules[0];assert.equal((await web.saveWorkScheduleAction(today,540,600," ",today,540,{manualScheduleId:fresh.id,expectedUpdatedAt:fresh.updatedAt.toISOString()})).ok,true);assert.deepEqual(h.schedules,[]);
 const movedEmpty=await web.saveWorkScheduleAction("2101-02-01",540,600,"new", "2101-01-01",550,{manualScheduleId:null,expectedUpdatedAt:""});assert.equal(movedEmpty.ok,true);assert.equal(h.audits.at(-1).metadata.sourceScheduleDate,"2101-01-01");assert.equal(h.audits.at(-1).metadata.sourceStartMinute,550);
 assert.equal((await web.deleteWorkScheduleAction(today,540)).ok,true);assert.equal((await web.saveWorkScheduleAction("bad",540,600,"x")).error,"날짜를 다시 선택하세요.");assert.equal((await web.deleteWorkScheduleAction(today,539)).error,"시작 시간을 다시 선택하세요.");
});
test("changes safe structured snapshots/page5/stable tie/filter; actor private data never escapes",async()=>{
 for(let n=0;n<7;n++)h.audits.push({id:`log-${n}`,targetType:"WorkSchedule",actorId:employee.id,actor:{...employee,profileImageStorageKey:"PRIVATE_STORAGE",profileImageUpdatedAt:new Date()},createdAt:new Date(0),message:"변경",metadata:{source:"work-schedule",changeType:"workSchedule.update",scheduleDate:today,previousScheduleDate:today,previousStartMinute:540,previousEndMinute:600,previousContent:"이전",nextScheduleDate:today,nextStartMinute:600,nextEndMinute:650,nextContent:"다음",passwordHash:"PRIVATE_HASH",ipAddress:"PRIVATE_IP"}});
 const response=await changes.GET(request(`/changes?date=${today}&page=99`));assert.equal(response.status,200);const data=await response.json();assert.equal(data.page,2);assert.equal(data.pageSize,5);assert.equal(data.total,7);assert.deepEqual(data.logs.map((r:Row)=>r.id),["log-1","log-0"]);assert.deepEqual(data.actors,[{id:employee.id,name:employee.name}]);assert.equal(data.logs[0].previous.content,"이전");assert.doesNotMatch(JSON.stringify(data),/PRIVATE_|email|metadata|profileImage|ipAddress/);
 assert.equal((await(await changes.GET(request("/changes?actorId=unknown"))).json()).total,0);for(const path of ["/changes?date=","/changes?page=0","/changes?page=1.5","/changes?page=9007199254740992","/changes?actorId=bad:id","/changes?page=1&page=2","/changes?role=ADMIN"])assert.equal((await changes.GET(request(path))).status,400);
 assert.ok(h.transactions.every((v:Row)=>v.isolationLevel==="RepeatableRead"));assert.equal(core.toMobileScheduleChange({id:"bad",createdAt:new Date().toISOString(),actor:employee,message:null,metadata:{changeType:"other",previousContent:"secret",previousScheduleDate:today,previousStartMinute:-999,previousEndMinute:0}}).previous,null);
});
