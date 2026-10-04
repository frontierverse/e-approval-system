import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as generated from '../../src/generated/prisma/client.ts';
const {Prisma}=generated;
const nodeRequire = createRequire(import.meta.url);
export function createYouthActivitiesHarness() {
  const iso='2026-10-04T00:00:00.000Z', now=new Date(iso), h={reads:[],writes:[],locks:[],invalidated:[],transactions:[],auditFailure:false,beforeTx:null,txErrors:0};
  const definitions={user:['id','name','status','role','canManageYouth','canViewYouthDetails','canViewYouthContacts','canDownloadYouthDocuments','hireDate','resignationDate'],youth:['id','name','admissionDate','dischargeDate','actualDischargeDate','purgeStartedAt','purgedAt','updatedAt'],youthPersonalSchedule:['id','youthId','content','startMinute','endMinute','selectionMode','occurrenceDates','recurrenceWeekdays','recurrenceStartDate','recurrenceEndDate','scheduleType','hospitalName','escortType','escortUserId','escortName','nextAppointmentDate','updatedAt'],youthCommonSchedule:['id','weekday','startHour','startMinute','endHour','endMinute','content','updatedAt'],studyConcept:['id','subject','subunitId','content','updatedAt'],studyConceptCheck:['id','conceptId','youthId','checkedAt'],youthRule:['id','category','detail','targetYouthId','createdAt','updatedAt'],youthMutationReceipt:['id','actorId','requestId','operation','targetType','targetId','youthId','payloadHash','committedUpdatedAt','committedTargetsJson','state','committedAt'],auditLog:null};
  const equal=(a,b)=>a instanceof Date&&b instanceof Date?a.getTime()===b.getTime():a===b;
  const match=(row,where={})=>Object.entries(where).every(([key,value])=>{
    if(key==='AND')return(Array.isArray(value)?value:[value]).every(v=>match(row,v));
    if(key==='OR')return value.some(v=>match(row,v));
    if(key==='NOT')return !(Array.isArray(value)?value:[value]).some(v=>match(row,v));
    if(['actorId_requestId','conceptId_youthId','weekday_startMinute'].includes(key))return match(row,value);
    const current=row[key];
    if(value===null||value instanceof Date||typeof value!=='object')return equal(current,value);
    if('path'in value){const result=value.path.reduce((v,k)=>v?.[k],current);return value.equals===Prisma.JsonNull?result===null:equal(result,value.equals);}
    if('is'in value)return current!=null&&match(current,value.is);
    if('in'in value&&!value.in.includes(current))return false;
    if('not'in value&&equal(current,value.not))return false;
    if('lt'in value&&!(current!=null&&current<value.lt))return false;
    if('gt'in value&&!(current!=null&&current>value.gt))return false;
    if('lte'in value&&!(current!=null&&current<=value.lte))return false;
    if('gte'in value&&!(current!=null&&current>=value.gte))return false;
    if('hasSome'in value&&!value.hasSome.some(v=>current?.includes(v)))return false;
    return true;
  });
  const decorate=(model,row)=>({...row,...(model==='youthRule'?{targetYouth:h.youth.find(y=>y.id===row.targetYouthId)??null}:{}),...(model==='studyConcept'?{checks:h.studyConceptCheck.filter(c=>c.conceptId===row.id)}:{}),...(model==='youthPersonalSchedule'?{youth:h.youth.find(y=>y.id===row.youthId)}:{}),...(model==='auditLog'?{actor:h.user.find(u=>u.id===row.actorId)}:{})});
  const project=(row,select)=>{if(!select)return structuredClone(row);return Object.fromEntries(Object.entries(select).filter(([,value])=>value).map(([key,value])=>[key,value===true?structuredClone(row[key]):Array.isArray(row[key])?row[key].filter(v=>match(v,value.where)).map(v=>project(v,value.select)):row[key]==null?null:project(row[key],value.select)]));};
  const find=(model,args={})=>{const rows=h[model].map(row=>decorate(model,row)).filter(row=>match(row,args.where));const orders=Array.isArray(args.orderBy)?args.orderBy:[args.orderBy??{}];rows.sort((a,b)=>{for(const order of orders)for(const[key,direction]of Object.entries(order)){const delta=a[key]<b[key]?-1:a[key]>b[key]?1:0;if(delta)return direction==='desc'?-delta:delta;}return 0;});return rows.slice(args.skip??0,args.take===undefined?undefined:(args.skip??0)+args.take).map(row=>project(row,args.select));};
  const schema=(model,data)=>{if(definitions[model])for(const key of Object.keys(data))assert.ok(definitions[model].includes(key),`${model}: unexpected database field ${key}`);};
  const db={async $queryRaw(strings,...args){h.locks.push({sql:strings.sql??strings.join?.('?')??String(strings),values:Array.isArray(strings.values)?strings.values:args});return[];}};
  for(const model of Object.keys(definitions))db[model]={
    async findUnique(args){h.reads.push({model,...args});return find(model,{...args,take:1})[0]??null;},
    async findUniqueOrThrow(args){const row=await this.findUnique(args);if(!row)throw Error('missing');return row;},
    async findFirst(args){h.reads.push({model,...args});return find(model,{...args,take:1})[0]??null;},
    async findMany(args){h.reads.push({model,...args});return find(model,args);},
    async count(args){h.reads.push({model,...args});return h[model].map(row=>decorate(model,row)).filter(row=>match(row,args.where)).length;},
    async create(args){schema(model,args.data);if(model==='auditLog'&&h.auditFailure)throw Error('PRIVATE_AUDIT_FAILURE');if(model==='youthMutationReceipt'&&h[model].some(row=>row.actorId===args.data.actorId&&row.requestId===args.data.requestId))throw Error('duplicate');const row={id:`${model}-${h[model].length+1}`,createdAt:new Date(now),updatedAt:new Date(now),committedTargetsJson:null,scrubbedAt:null,...structuredClone(args.data)};h[model].push(row);h.writes.push({model,op:'create'});return project(decorate(model,row),args.select);},
    async update(args){schema(model,args.data);const row=h[model].find(r=>match(decorate(model,r),args.where));if(!row)throw Error('missing');Object.assign(row,structuredClone(args.data));h.writes.push({model,op:'update'});return project(decorate(model,row),args.select);},
    async updateMany(args){schema(model,args.data);const rows=h[model].filter(r=>match(decorate(model,r),args.where));rows.forEach(r=>Object.assign(r,structuredClone(args.data)));h.writes.push({model,op:'updateMany'});return{count:rows.length};},
    async upsert(args){return find(model,{where:args.where}).length?this.update({...args,data:args.update}):this.create({...args,data:args.create});},
    async delete(args){const index=h[model].findIndex(row=>match(decorate(model,row),args.where));if(index<0)throw Error('missing');const[row]=h[model].splice(index,1);if(model==='studyConcept')h.studyConceptCheck=h.studyConceptCheck.filter(check=>check.conceptId!==row.id);h.writes.push({model,op:'delete'});return project(decorate(model,row),args.select);},
    async deleteMany(args){const old=h[model].length;h[model]=h[model].filter(row=>!match(decorate(model,row),args.where));h.writes.push({model,op:'deleteMany'});return{count:old-h[model].length};},
  };
  let queue=Promise.resolve();db.$transaction=(callback,options)=>{const run=queue.then(async()=>{h.transactions.push(options);h.beforeTx?.();const snapshot=structuredClone(Object.fromEntries(Object.keys(definitions).map(model=>[model,h[model]]))),writeCount=h.writes.length;try{const result=await callback(db);if(h.txErrors-->0)throw new Prisma.PrismaClientKnownRequestError('conflict',{code:'P2034',clientVersion:'fixture'});return result;}catch(error){Object.assign(h,snapshot);h.writes.length=writeCount;throw error;}});queue=run.catch(()=>{});return run;};
  const modules=new Map(),mocks={
    'server-only':{},'next/cache':{revalidatePath:path=>h.invalidated.push(path)},'next/navigation':{unstable_rethrow:nodeRequire('next/navigation').unstable_rethrow,redirect:path=>{throw Object.assign(Error('NEXT_REDIRECT'),{digest:`NEXT_REDIRECT;replace;${path};307;`});}},
    '@/generated/prisma/client':generated,'@/lib/prisma':{prisma:db},'@/lib/auth':{requireUser:async()=>{if(h.authError)throw h.authError;return h.authSnapshot??structuredClone(h.user[0]);}},
    '@/lib/audit-log-request':{getCurrentAuditLogRequestData:async()=>({ipAddress:'PRIVATE_IP'}),getAuditLogRequestData:()=>({ipAddress:'PRIVATE_IP'})},
    '@/lib/login-history-core':{getLoginRequestInfo:()=>({})},'@/lib/mobile-auth':{getMobileSession:async()=>h.session?{userId:h.session}:null}
  };
  function load(file){if(modules.has(file))return modules.get(file);let source=readFileSync(new URL(`../../src/${file}`,import.meta.url),'utf8');if(file==='lib/mobile-youth.ts')source=source.slice(source.indexOf('export const youthPrivateHeaders'),source.indexOf('export type YouthRouteAction')).replace(/^/,'const {YouthError}=require("@/lib/mobile-youth-core");\n');const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,evaluated={exports:{}};modules.set(file,evaluated.exports);new Function('require','module','exports',output)(name=>{if(name in mocks)return mocks[name];if(name.startsWith('@/'))return load(name.slice(2)+'.ts');return nodeRequire(name);},evaluated,evaluated.exports);modules.set(file,evaluated.exports);return evaluated.exports;}
  function reset(){for(const model of Object.keys(definitions))h[model]=[];h.user=[{id:'actor',name:'합성 직원',status:'ACTIVE',role:'USER',canManageYouth:true,canViewYouthDetails:false,canViewYouthContacts:false,canDownloadYouthDocuments:false,hireDate:null,resignationDate:null}];h.youth=[{id:'youth-a',name:'합성 청소년',admissionDate:null,dischargeDate:null,actualDischargeDate:null,purgeStartedAt:null,purgedAt:null,updatedAt:new Date(iso)},{id:'youth-b',name:'다른 청소년',admissionDate:null,dischargeDate:null,actualDischargeDate:null,purgeStartedAt:null,purgedAt:null,updatedAt:new Date(iso)}];Object.assign(h,{session:'actor',reads:[],writes:[],locks:[],invalidated:[],transactions:[],auditFailure:false,beforeTx:null,txErrors:0,authSnapshot:null,authError:null});}
  reset();return{h,db,iso,now,ctx:{actorId:'actor',db,now:()=>now},load,reset};
}
