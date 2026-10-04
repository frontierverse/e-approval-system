import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as generated from '../../src/generated/prisma/client.ts';
const requireNode=createRequire(import.meta.url);
export function youthPurgeHarness() {
 const h={now:new Date('2026-10-04T03:00:00Z'),tables:{},objects:new Set(),removed:[],failStorage:false,failFinalAudit:false,beforeDelete:null,afterDelete:null,writes:0,transactions:0};
 const hash='a'.repeat(64);
 const collections=['youth','user','auditLog','youthDecisionUpload','youthDecisionFileCleanup','youthMutationReceipt','youthViewRequest','youthDecisionDocument','youthFamilyContact','youthSpecialNote','youthDischargeExtension','youthAcademySchedule','youthPersonalSchedule','youthLearningSchedule','studyConceptCheck','youthRule','mathResult','mathVaultLog','dailyWorkReport','resourceAttachment','attachment','mobileDraftUpload','staffChatAttachment'];
 for(const name of collections)h.tables[name]=[];
 function matches(row,where={}) {
  if(!row)return false;
  return Object.entries(where).every(([key,value])=>{
   if(key==='OR')return value.some(part=>matches(row,part));
   if(key==='AND')return value.every(part=>matches(row,part));
   if(key.includes('_')&&!Object.hasOwn(row,key)&&value&&typeof value==='object')return matches(row,value);
   if(value instanceof Date)return row[key] instanceof Date&&row[key].getTime()===value.getTime();
   if(value===null||typeof value!=='object')return row[key]===value;
   if(value.path)return value.path.reduce((r,k)=>r?.[k],row[key])===value.equals;
   if('not' in value)return row[key]!==value.not;
   if('in' in value)return value.in.includes(row[key]);
   if('lte' in value)return row[key]!=null&&row[key]<=value.lte;
   if('gte' in value)return row[key]!=null&&row[key]>=value.gte;
   if('gt' in value)return row[key]!=null&&row[key]>value.gt;
   return matches(row[key],value);
  });
 }
 function change(row,data) {
  for(const [key,value]of Object.entries(data))row[key]=value===generated.Prisma.DbNull?null:value?.increment?row[key]+value.increment:value;
  h.writes++;
 }
 function enrich(name,row) {
  if(!row)return null;
  if(name!=='youth')return structuredClone(row);
  const links={decisionDocuments:'youthDecisionDocument',notes:'youthSpecialNote',rules:'youthRule',personalSchedules:'youthPersonalSchedule',learningSchedules:'youthLearningSchedule',academySchedules:'youthAcademySchedule',dischargeExtensions:'youthDischargeExtension'};
  const result={...row};for(const [field,table]of Object.entries(links))result[field]=h.tables[table].filter(item=>(item.youthId??item.targetYouthId)===row.id);
  return structuredClone(result);
 }
 const db={};
 for(const name of collections)db[name]={
  findUnique:async({where})=>enrich(name,h.tables[name].find(row=>matches(row,where))),
  findUniqueOrThrow:async(args)=>{const result=await db[name].findUnique(args);assert.ok(result,'actual fixture row missing '+name);return result;},
  findFirst:async({where={}}={})=>enrich(name,h.tables[name].find(row=>matches(row,where))),
  findMany:async({where={},orderBy=[],take}={})=>{
   let rows=h.tables[name].filter(row=>matches(row,where));
   const order=Array.isArray(orderBy)?orderBy:[orderBy];
   rows=[...rows].sort((a,b)=>{for(const part of order){const [key,raw]=Object.entries(part)[0]??[],dir=typeof raw==='object'?raw.sort:raw;if(a[key]===b[key])continue;if(a[key]==null)return -1;if(b[key]==null)return 1;return(a[key]<b[key]?-1:1)*(dir==='desc'?-1:1);}return 0;});
   return(take===undefined?rows:rows.slice(0,take)).map(row=>enrich(name,row));
  },
  count:async({where={}}={})=>h.tables[name].filter(row=>matches(row,where)).length,
  create:async({data})=>{if(name==='auditLog'&&h.failFinalAudit&&data.metadata?.changeType==='youth.retention.purged')throw Error('PRIVATE_AUDIT_FAILURE');const row={id:name+'-'+h.tables[name].length,state:name==='youthDecisionFileCleanup'?'pending':undefined,createdAt:h.now,claimId:null,leaseUntil:null,completedAt:null,lastErrorCode:null,attemptCount:0,...data};h.tables[name].push(row);h.writes++;return structuredClone(row);},
  update:async({where,data})=>{const row=h.tables[name].find(row=>matches(row,where));assert.ok(row,'update fixture missing '+name);change(row,data);return enrich(name,row);},
  updateMany:async({where,data})=>{const rows=h.tables[name].filter(row=>matches(row,where));rows.forEach(row=>change(row,data));return{count:rows.length};},
  deleteMany:async({where})=>{const prior=h.tables[name].length;h.tables[name]=h.tables[name].filter(row=>!matches(row,where));h.writes++;return{count:prior-h.tables[name].length};},
  upsert:async({where,create,update})=>{const row=h.tables[name].find(row=>matches(row,where));return row?db[name].update({where,data:update}):db[name].create({data:create});},
 };
 db.$queryRaw=async(input,...values)=>{
  const sql=Array.isArray(input)?input.join('?'):input.strings.join('?');if(!Array.isArray(input))values=input.values;
  if(sql.includes('FROM "DailyWorkReport"'))return h.tables.dailyWorkReport.filter(row=>row.youthReports.some(note=>note.youthId===values[0]));
  assert.match(sql,/FOR (SHARE|UPDATE)|pg_advisory_xact_lock/);return[];
 };
 db.$executeRaw=async(input,...values)=>{
  const sql=Array.isArray(input)?input.join('?'):input.strings.join('?');if(!Array.isArray(input))values=input.values;
  assert.match(sql,/UPDATE "AuditLog"/);const[ids,quoted]=values;
  for(const row of h.tables.auditLog)if(ids.includes(row.targetId)||JSON.stringify(row.metadata).includes(quoted)){row.metadata={personalDataPurged:true};row.message='개인정보 파기';}
 };
 db.$transaction=async(operation)=>{
  h.transactions++;const tables=structuredClone(h.tables),writes=h.writes;
  try{return await operation(db);}catch(error){h.tables=tables;h.writes=writes;throw error;}
 };
 const storage={
  deleteResourceStoredFile:async(ref)=>{if(h.beforeDelete)await h.beforeDelete(ref);if(h.failStorage)throw Error('PRIVATE_PROVIDER_FAILURE');h.objects.delete(ref.storageKey);h.removed.push(ref.storageKey);if(h.afterDelete)await h.afterDelete(ref);},
  resourceStoredFileExists:async(ref)=>h.objects.has(ref.storageKey),
 };
 const ports={
  'server-only':{},'@/generated/prisma/client':generated,
  '@/lib/prisma':{prisma:new Proxy({},{get(){throw Error('Global DB fallback forbidden');}})},
  '@/lib/auth':{requireAdmin:async()=>({id:'admin',role:'ADMIN'})},
  '@/lib/session':{getSessionUserId:async()=> 'admin'},
  '@/lib/audit-log-request':{getCurrentAuditLogRequestData:async()=>({})},
 };
 const modules=new Map();
 function load(file){
  if(modules.has(file))return modules.get(file).exports;
  const source=readFileSync(new URL('../../src/'+file,import.meta.url),'utf8'),js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const evaluated={exports:{}};modules.set(file,evaluated);
  new Function('require','module','exports',js)((name)=>Object.hasOwn(ports,name)?ports[name]:name.startsWith('@/')?load(name.slice(2)+'.ts'):requireNode(name),evaluated,evaluated.exports);
  return evaluated.exports;
 }
 const domain=load('lib/youth-purge.ts'),context={actorId:'admin',db,now:()=>h.now,storage};
 h.tables.user.push({id:'admin',role:'ADMIN',status:'ACTIVE',canManageYouth:true,canViewYouthDetails:true,canViewYouthContacts:true});
 function parent(id='youth-1',{tracked=true,files=true}={}) {
  const row={id,name:'합성 '+id,admissionDate:'2020-01-01',birthDate:'2005-02-03',age:null,initialDischargeDate:'2020-06-01',dischargeDate:'2020-06-01',actualDischargeDate:'2020-06-01',caseClosedDate:'2020-07-01',retentionUntil:'2025-07-01',retentionBasis:'보존기준',retentionHoldReason:null,retentionVersion:0,purgeStartedAt:null,purgeLeaseUntil:null,purgedAt:null,purgeBlockedReason:null,purgeLastCheckedAt:null,purgeNextCheckAt:null,phone:'010-1111-2222',familyPhone:'연락처',familyContact:'보호자',familyRelationship:'부',updatedAt:h.now,mathSettlement:{reopenedAt:null,amount:3000},_count:{mathResults:1}};
  h.tables.youth.push(row);
  for(const table of ['youthFamilyContact','youthSpecialNote','youthDischargeExtension','youthAcademySchedule','youthPersonalSchedule','youthLearningSchedule','studyConceptCheck','youthRule'])h.tables[table].push({id:table+'-'+id,youthId:id,targetYouthId:id,phone:'010',content:'합성 비공개 기록'});
  if(tracked)h.tables.youthMutationReceipt.push({id:'receipt-'+id,actorId:'admin',requestId:'create-'+id,operation:'profile.create',targetType:'Youth',targetId:id,youthId:id,state:'committed',payloadHash:hash,committedUpdatedAt:h.now,committedTargetsJson:null,committedAt:h.now,scrubbedAt:null});
  if(files){const doc={id:'doc-'+id,youthId:id,originalName:'합성결정문.pdf',storageKey:'final-'+id,storageProvider:'local',mimeType:'application/pdf',size:3,createdAt:h.now,updatedAt:h.now};h.tables.youthDecisionDocument.push(doc);h.objects.add(doc.storageKey);
   if(tracked)h.tables.youthDecisionUpload.push({id:'upload-'+id,actorId:'admin',startRequestId:'upload-request-'+id,startPayloadHash:hash,purpose:'youth-decision',sourceKind:'client-file',targetYouthId:id,consumedYouthId:id,consumedMutationId:'receipt-'+id,consumedDocumentId:doc.id,sourceDocumentId:null,originalName:doc.originalName,mimeType:doc.mimeType,size:3,expectedSha256:hash,plaintextSha256:hash,storedSha256:hash,storedSize:3,storageProvider:'local',finalKey:doc.storageKey,stagingKey:'stage-'+id,state:'consumed',lastGrantExpiresAt:null,finalizeClaimId:null,finalizeLeaseUntil:null,finalizeIv:null,finalizeWriteEvidence:'confirmed',hadUnknownWrite:false,completedAt:h.now,createdAt:h.now,expiresAt:new Date(h.now.getTime()+7200000),sourceFileUpdatedAt:null,sourceYouthUpdatedAt:null,sourceStorageProvider:null,sourceStorageKey:null});
   if(tracked)h.objects.add('stage-'+id);
  }
  return row;
 }
 const input=(row)=>({version:row.retentionVersion,confirmationName:row.name,reviewedCopies:true});
 const request=(row,ctx=context)=>domain.requestYouthPurge(ctx,row.id,input(row));
 return{h,db,domain,context,parent,input,request,load};
}
