import { ApiError } from './api';
import type { YouthBasic, YouthBasicDetail, YouthContacts, YouthContactsView, YouthDetailsView, YouthHistory, YouthList, YouthMutation, YouthOperation, YouthPermissions, YouthProfileDraft, YouthProfilePatch, YouthSensitiveDetails, YouthViewBase } from '../types/youth';
export const youthRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const youthExact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every(k => keys.includes(k));
export const youthId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
export const youthText = (v: unknown): v is string => typeof v === 'string';
export const youthNullableText = (v: unknown): v is string | null => v === null || youthText(v);
export const youthInteger = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function youthScalar(v: unknown): string | undefined { return v === undefined ? undefined : typeof v === 'string' ? v : ''; }
export function youthPage(v: unknown) { return v === undefined ? 1 : typeof v === 'string' && /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null; }
export function isYouthDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y,m,d] = v.split('-').map(Number); if (y < 1 || y > 9999) return false;
  const date = new Date(0); date.setUTCFullYear(y,m-1,d); date.setUTCHours(0,0,0,0);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d;
}
export const youthDateOrNull = (v: unknown): v is string | null => v === null || isYouthDate(v);
export function isYouthTimestamp(v: unknown): v is string { return typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
export function formatYouthDate(v: string | null) { if (!v || !isYouthDate(v)) return '미등록'; const [y,m,d]=v.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; }
export function formatYouthTimestamp(v: string | null) { return v && isYouthTimestamp(v) ? new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(v)) : '미등록'; }
export function newYouthRequestId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16);}); }
export function isYouthPermissions(v: unknown): v is YouthPermissions {
  const keys=['canViewYouthBasic','canViewYouthDetails','canViewYouthContacts','canDownloadYouthDocuments','canManageYouth','canDeleteYouth'];
  return youthRecord(v) && youthExact(v,keys) && v.canViewYouthBasic===true && v.canDeleteYouth===false && keys.slice(1,5).every(k=>typeof v[k]==='boolean');
}
export function isYouthBasic(v: unknown): v is YouthBasic { return youthRecord(v) && youthExact(v,['id','name','admissionDate','dischargeDate','updatedAt']) && youthId(v.id) && youthText(v.name) && v.name.trim().length>0 && youthDateOrNull(v.admissionDate) && youthDateOrNull(v.dischargeDate) && isYouthTimestamp(v.updatedAt); }
export function isYouthBasicDetail(v: unknown,id?:string): v is YouthBasicDetail { return youthRecord(v) && youthExact(v,['today','permissions','youth']) && isYouthDate(v.today) && isYouthPermissions(v.permissions) && isYouthBasic(v.youth) && (!id || v.youth.id===id); }
function pagination(v: Record<string,unknown>,size:number,rows:unknown[]) { return youthInteger(v.total) && youthInteger(v.totalPages) && youthInteger(v.page) && v.page>=1 && v.pageSize===size && v.totalPages===Math.max(1,Math.ceil(v.total/size)) && rows.length===Math.max(0,Math.min(size,v.total-(v.page-1)*size)); }
export function isYouthList(v: unknown): v is YouthList { return youthRecord(v) && youthExact(v,['today','permissions','items','q','page','pageSize','total','totalPages']) && isYouthDate(v.today) && isYouthPermissions(v.permissions) && youthText(v.q) && Array.isArray(v.items) && v.items.every(isYouthBasic) && new Set(v.items.map(x=>x.id)).size===v.items.length && pagination(v,20,v.items); }
export function isYouthDetails(v: unknown): v is YouthSensitiveDetails {
  return youthRecord(v) && youthExact(v,['birthDate','age','koreanAge','initialDischargeDate','dischargeExtensions']) && youthDateOrNull(v.birthDate) && (v.age===null||youthInteger(v.age)) && (v.koreanAge===null||youthInteger(v.koreanAge)) && youthDateOrNull(v.initialDischargeDate) && Array.isArray(v.dischargeExtensions) && v.dischargeExtensions.every(e=>youthRecord(e)&&youthExact(e,['id','extensionOrder','previousDischargeDate','extendedDischargeDate','reason','processedAt','processedBy'])&&youthId(e.id)&&youthInteger(e.extensionOrder)&&isYouthDate(e.previousDischargeDate)&&isYouthDate(e.extendedDischargeDate)&&youthText(e.reason)&&isYouthTimestamp(e.processedAt)&&youthRecord(e.processedBy)&&youthExact(e.processedBy,['id','name'])&&youthId(e.processedBy.id)&&youthText(e.processedBy.name));
}
export function isYouthContacts(v: unknown): v is YouthContacts { return youthRecord(v)&&youthExact(v,['phone','familyContacts'])&&youthNullableText(v.phone)&&Array.isArray(v.familyContacts)&&v.familyContacts.every(c=>youthRecord(c)&&youthExact(c,['id','relationship','phone'])&&youthId(c.id)&&youthNullableText(c.relationship)&&youthNullableText(c.phone)); }
const viewKeys=['ok','replayed','today','youthId','permissions','sourceUpdatedAt','auditedAt','serverNow','disclosureUntil'];
function isView(v: Record<string,unknown>,id:string) { return v.ok===true&&typeof v.replayed==='boolean'&&isYouthDate(v.today)&&v.youthId===id&&isYouthPermissions(v.permissions)&&isYouthTimestamp(v.sourceUpdatedAt)&&isYouthTimestamp(v.auditedAt)&&isYouthTimestamp(v.serverNow)&&isYouthTimestamp(v.disclosureUntil)&&Date.parse(v.disclosureUntil)>Date.parse(v.serverNow)&&Date.parse(v.disclosureUntil)-Date.parse(v.serverNow)<=300000; }
export function isYouthDetailsView(v:unknown,id:string):v is YouthDetailsView {return youthRecord(v)&&youthExact(v,[...viewKeys,'details'])&&isView(v,id)&&isYouthPermissions(v.permissions)&&v.permissions.canViewYouthDetails&&isYouthDetails(v.details);}
export function isYouthContactsView(v:unknown,id:string):v is YouthContactsView {return youthRecord(v)&&youthExact(v,[...viewKeys,'contacts'])&&isView(v,id)&&isYouthPermissions(v.permissions)&&v.permissions.canViewYouthContacts&&isYouthContacts(v.contacts);}
export function youthDisclosureDeadline(v:Pick<YouthViewBase,'serverNow'|'disclosureUntil'>,requestStarted:number) { return requestStarted + Math.max(0,Math.min(300000,Date.parse(v.disclosureUntil)-Date.parse(v.serverNow))); }
export function youthDisclosureCurrent(deadline:number,now=performance.now()) { return Number.isFinite(deadline) && now<deadline; }
const operations:YouthOperation[]=['profile.create','profile.patch','profile.extend','personal.create','personal.update','personal.delete','common.batch','concept.create','concept.delete','concept.check','rule.create','rule.delete','document.attach','document.delete'];
const mutationTargetTypes:Record<YouthOperation,string>={
 'profile.create':'Youth','profile.patch':'Youth','profile.extend':'Youth',
 'personal.create':'YouthPersonalSchedule','personal.update':'YouthPersonalSchedule','personal.delete':'YouthPersonalSchedule',
 'common.batch':'YouthCommonScheduleBatch','concept.create':'StudyConcept','concept.delete':'StudyConcept','concept.check':'StudyConceptCheck',
 'rule.create':'YouthRule','rule.delete':'YouthRule','document.attach':'Youth','document.delete':'YouthDecisionDocument'
};
export function isYouthMutation<T = YouthBasicDetail>(v: unknown,expected:{operation:YouthOperation;requestId:string;targetId?:string;youthId?:string|null},resultGuard:(value:unknown)=>value is T = isYouthBasicDetail as (value:unknown)=>value is T):v is YouthMutation<T> {
  return youthRecord(v)&&youthExact(v,['ok','replayed','requestId','operation','outcome','targetType','targetId','youthId','committedAt','committedUpdatedAt','result'])&&v.ok===true&&typeof v.replayed==='boolean'&&v.requestId===expected.requestId&&operations.includes(v.operation as YouthOperation)&&['present','deleted','unavailable'].includes(String(v.outcome))&&v.targetType===mutationTargetTypes[expected.operation]&&youthId(v.targetId)&&(v.youthId===null||youthId(v.youthId))&&isYouthTimestamp(v.committedAt)&&(v.committedUpdatedAt===null||isYouthTimestamp(v.committedUpdatedAt))&&(v.result===null||resultGuard(v.result))&&v.operation===expected.operation&&(!expected.targetId||v.targetId===expected.targetId)&&(!('youthId' in expected)||v.youthId===expected.youthId)&&(v.outcome!=='unavailable'||v.result===null&&v.committedUpdatedAt===null);
}
export function isYouthHistory(v:unknown,id?:string):v is YouthHistory {return youthRecord(v)&&youthExact(v,['today','permissions','youthId','items','page','pageSize','total','totalPages'])&&isYouthDate(v.today)&&isYouthPermissions(v.permissions)&&(v.youthId===null||youthId(v.youthId))&&(!id||v.youthId===id)&&Array.isArray(v.items)&&[5,10].includes(Number(v.pageSize))&&v.items.every(x=>youthRecord(x)&&youthExact(x,['id','createdAt','action','actor','changes'])&&youthId(x.id)&&isYouthTimestamp(x.createdAt)&&youthText(x.action)&&(x.actor===null||youthRecord(x.actor)&&youthExact(x.actor,['id','name'])&&youthId(x.actor.id)&&youthText(x.actor.name))&&Array.isArray(x.changes)&&x.changes.every(c=>youthRecord(c)&&youthExact(c,['field','label','from','to'])&&youthText(c.field)&&youthText(c.label)&&youthNullableText(c.from)&&youthNullableText(c.to)))&&pagination(v,Number(v.pageSize),v.items);}
export function youthUnknown(cause:unknown) { return !(cause instanceof ApiError) || cause.status===0 || (cause.status>=200&&cause.status<300) || cause.status===408 || cause.status===409 || cause.status>=500; }
export function youthPrivateFailure(cause:unknown) { return cause instanceof ApiError && [401,403,404].includes(cause.status); }
export function youthResponseError() { return new ApiError('청소년 정보를 확인하지 못했습니다. 다시 조회해 주세요.',200); }
export function youthProfileErrors(d:YouthProfileDraft,create:boolean) {
  const e:Record<string,string>={}; if(!d.name.trim())e.name='이름을 입력하세요.';
  for(const k of ['admissionDate',...(create?['dischargeDate','birthDate']:[])] as const)if(d[k as keyof YouthProfileDraft] && !isYouthDate(d[k as 'admissionDate']))e[k]='날짜를 YYYY-MM-DD로 입력하세요.';
  if(d.phone.trim()&&!/^010-\d{3,4}-\d{4}$/.test(d.phone.trim()))e.phone='010-0000-0000 형식으로 입력하세요.';
  for(const [index,row] of d.familyContacts.entries())if(row.phone.trim()&&!/^010-\d{3,4}-\d{4}$/.test(row.phone.trim()))e.familyContacts=`가족 ${index+1} 연락처를 010-0000-0000 형식으로 입력하세요.`;
  return e;
}
export function youthProfilePatch(d:YouthProfileDraft,base:YouthBasic,privateBase?:{birthDate?:string|null;contacts?:YouthContacts}):YouthProfilePatch {
  const patch:YouthProfilePatch={}; if(d.name.trim()!==base.name)patch.name=d.name.trim(); if((d.admissionDate||null)!==base.admissionDate)patch.admissionDate=d.admissionDate||null;
  if(privateBase && 'birthDate' in privateBase && (d.birthDate||null)!==privateBase.birthDate)patch.birthDate=d.birthDate||null;
  if(privateBase?.contacts){ if((d.phone.trim()||null)!==privateBase.contacts.phone)patch.phone=d.phone.trim()||null; const rows=d.familyContacts.filter(x=>x.relationship.trim()||x.phone.trim()).map(x=>({relationship:x.relationship.trim()||null,phone:x.phone.trim()||null})); const before=privateBase.contacts.familyContacts.map(({relationship,phone})=>({relationship,phone}));if(JSON.stringify(rows)!==JSON.stringify(before))patch.familyContacts=rows; }
  return patch;
}

export function isYouthDocuments(v:unknown,id:string):v is import('../types/youth').YouthDocuments{return youthRecord(v)&&youthExact(v,['today','youthId','permissions','documents'])&&isYouthDate(v.today)&&v.youthId===id&&isYouthPermissions(v.permissions)&&v.permissions.canDownloadYouthDocuments&&Array.isArray(v.documents)&&v.documents.every(x=>youthRecord(x)&&youthExact(x,['id','name','size','createdAt','updatedAt'])&&youthId(x.id)&&youthText(x.name)&&youthInteger(x.size)&&x.size>0&&isYouthTimestamp(x.createdAt)&&isYouthTimestamp(x.updatedAt));}
