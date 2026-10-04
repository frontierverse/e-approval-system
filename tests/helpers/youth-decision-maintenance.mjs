import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript'), ActualDate = Date;
const names = ['resourceUpload','resourceFileCleanup','youthDecisionUpload','youthDecisionFileCleanup','resourceAttachment','attachment','youthDecisionDocument','user','mobileDraftUpload','staffChatAttachment','youth'];
function match(row, where = {}) {
 for (const [key,value] of Object.entries(where)) {
  if(key === 'OR') { if(!value.some(part=>match(row,part))) return false; continue; }
  if(key === 'AND') { if(!value.every(part=>match(row,part))) return false; continue; }
  if(key === 'storageProvider_storageKey') { if(!match(row,value)) return false; continue; }
  const actual=row[key];
  if(value && typeof value==='object' && !(value instanceof ActualDate)) {
   if('in' in value && !value.in.includes(actual)) return false;
   if('not' in value && actual===value.not) return false;
   if('lte' in value && !(actual<=value.lte)) return false;
   if('gte' in value && !(actual>=value.gte)) return false;
  } else if(value instanceof ActualDate ? actual?.getTime()!==value.getTime() : actual!==value) return false;
 }
 return true;
}
export function cleanupHarness(kind = 'youth') {
 const h={clock:0,now:new ActualDate('2026-10-04T00:00:00.000Z'),state:Object.fromEntries(names.map(name=>[name,[]])),reads:[],writes:[],sql:[],deleted:[],exists:[],before:null,after:null,onDelete:null,onExists:null,next:0};
 class ClockDate extends ActualDate { constructor(...args) { super(...(args.length?args:[h.now.getTime()])); } static now(){return h.clock;} }
 const uploadModel=kind==='youth'?'youthDecisionUpload':'resourceUpload', queueModel=kind==='youth'?'youthDecisionFileCleanup':'resourceFileCleanup';
 const invoke=async(model,method,args)=>{
  h[method.startsWith('find')||method==='count'?'reads':'writes'].push({model,method,args});
  await h.before?.({model,method,args});
  const rows=h.state[model];let result;
  const found=()=>rows.find(row=>match(row,args.where));
  const apply=(row,data)=>{for(const[key,value]of Object.entries(data))row[key]=value&&typeof value==='object'&&'increment'in value?(row[key]??0)+value.increment:structuredClone(value);return row;};
  if(method==='findMany'){let selected=rows.filter(row=>match(row,args.where));for(const part of [...(args.orderBy??[])].reverse()){const[key,direction]=Object.entries(part)[0];selected.sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(direction==='asc'?1:-1));}result=selected.slice(0,args.take??selected.length);}
  else if(method==='findUnique')result=found()??null;
  else if(method==='count')result=rows.filter(row=>match(row,args.where)).length;
  else if(method==='updateMany'){let count=0;for(const row of rows)if(match(row,args.where)){apply(row,args.data);count++;}result={count};}
  else if(method==='update'){const row=found();assert(row,'missing update target');result=apply(row,args.data);}
  else if(method==='upsert'){const row=found();if(row)result=apply(row,args.update);else{result={id:'queue-'+(++h.next),state:'pending',attemptCount:0,claimId:null,leaseUntil:null,completedAt:null,lastErrorCode:null,...structuredClone(args.create)};rows.push(result);}}
  else throw Error('unsupported '+method);
  result=structuredClone(result);await h.after?.({model,method,args,result});return result;
 };
 const tx=Object.fromEntries(names.map(model=>[model,Object.fromEntries(['findMany','findUnique','count','updateMany','update','upsert'].map(method=>[method,args=>invoke(model,method,args)]))]));
 tx.$queryRaw=async query=>{h.sql.push(query);await h.before?.({model:'sql',method:'query',args:query});return[];};
 const db={$transaction:async operation=>{const previous=structuredClone(h.state);try{return await operation(tx);}catch(error){h.state=previous;throw error;}}};
 const storage={deleteResourceStoredFile:async(row,options)=>{h.deleted.push({id:row.id,key:row.storageKey,signal:options.signal});await h.onDelete?.(row,options);},resourceStoredFileExists:async(row,options)=>{h.exists.push({id:row.id,signal:options.signal});return await h.onExists?.(row,options)??false;}};
 const context={db,storage,now:()=>new ActualDate(h.now)};
 const loaded={exports:{}};
 const imports=name=>{
  if(name==='server-only')return{};if(name==='node:crypto')return require(name);
  if(name==='@/generated/prisma/client')return{Prisma:{sql:(strings,...values)=>({strings,values})}};
  if(name==='@/lib/prisma')return{prisma:db};
  if(name==='@/lib/youth-mobile-context')return{lockYouthActor:async()=>({status:'ACTIVE',canManageYouth:true}),assertYouthPermission:()=>{}};
  if(name==='@/lib/resource-library-queries')return{lockResourceActor:async()=>({status:'ACTIVE'}),resourceNow:()=>new ActualDate(h.now)};
  if(name==='@/lib/resource-file-storage')return storage;
  throw Error('unexpected runtime import '+name);
 };
 const file=kind==='youth'?'youth-decision-file-cleanup.ts':'resource-file-cleanup.ts';
 const input=readFileSync(new URL('../../src/lib/'+file,import.meta.url),'utf8');
 const output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports','Date',output)(imports,loaded,loaded.exports,ClockDate);
 function upload(id,extra={}){const row={id,actorId:'retired-actor',state:'deleting',terminalReason:'expired',storageProvider:'synthetic',stagingKey:null,finalKey:'final/'+id,lastGrantExpiresAt:null,finalizeLeaseUntil:null,finalizeWriteEvidence:'confirmed',hadUnknownWrite:false,expiresAt:new ActualDate(h.now.getTime()-1000),originalName:'private.pdf',mimeType:'application/pdf',size:10,...extra};h.state[uploadModel].push(row);return row;}
 function queue(id,extra={}){const row={id,storageProvider:'synthetic',storageKey:'final/'+id,objectKind:'final',sourceUploadId:id,sourceMutationId:null,youthId:null,state:'pending',notBefore:new ActualDate(h.now.getTime()-1000),nextAttemptAt:new ActualDate(h.now.getTime()-1000),claimId:null,leaseUntil:null,attemptCount:0,lastErrorCode:null,completedAt:null,...extra};h.state[queueModel].push(row);return row;}
 return{h,context,api:loaded.exports,upload,queue,uploadModel,queueModel,run:options=>loaded.exports[kind==='youth'?'reconcileYouthDecisionFileQueue':'reconcileResourceFileQueue'](context,options),expire:options=>loaded.exports[kind==='youth'?'reconcileYouthDecisionUploadExpiry':'reconcileResourceLibraryMaintenance'](context,options)};
}
