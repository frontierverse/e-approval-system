import assert from 'node:assert/strict';
import { describe, beforeEach, test } from 'node:test';
import { createYouthActivitiesHarness } from './helpers/youth-activities.mjs';
// The harness runs actual parsers/context/domain/HTTP/web source with a schema-checked transactional store.
// It serializes synthetic transactions; real PostgreSQL lock/cascade assertions live in the guarded PG suite.
const f=createYouthActivitiesHarness(),{h,ctx,iso,load}=f;
const schedules=load('lib/youth-mobile-schedules.ts'),learning=load('lib/youth-mobile-learning.ts'),rules=load('lib/youth-mobile-rules.ts'),core=load('lib/youth-mobile-activity-core.ts');
const histories=load('lib/youth-mobile-activity-history.ts');
const personalRoute=load('app/api/mobile/youth/[id]/personal-schedules/route.ts'),known=load('app/api/mobile/youth/personal-schedules/[id]/route.ts'),commonRoute=load('app/api/mobile/youth/common-schedules/batch/route.ts'),learningRoute=load('app/api/mobile/youth/[id]/learning/checks/[conceptId]/route.ts'),rulesRoute=load('app/api/mobile/youth/rules/route.ts');
const webPersonal=load('app/youth/personal-schedule/actions.ts'),webCommon=load('app/youth/common-schedule/actions.ts'),webLearning=load('app/youth/learning-progress/actions.ts'),webRules=load('app/youth/rules/actions.ts');
const input=(extra={})=>({content:'합성 상담',startMinute:540,endMinute:600,selectionMode:'DATES',occurrenceDates:['2026-10-04'],recurrenceWeekdays:[],recurrenceStartDate:'',recurrenceEndDate:'',scheduleType:'GENERAL',...extra});
const create=(requestId='personal-key-1',extra={})=>schedules.createMobilePersonalSchedule(ctx,'youth-a',{requestId,input:input(extra)});
const request=(path,method='GET',body=undefined)=>new Request('https://fixture.invalid/api/mobile/youth'+path,{method,headers:{Authorization:'Bearer synthetic',...(method==='GET'?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
const params=(id,extra={})=>({params:Promise.resolve({id,...extra})});
const code=(value,status,expected)=>{assert.equal(value.status,status);assert.equal(value.code,expected);return true;};
const rejected=(promise,status,expected)=>assert.rejects(promise,error=>code(error,status,expected));
const blankBaseline=(weekday,startMinute=540)=>({weekday,startMinute,scheduleId:null,expectedUpdatedAt:null});
const commonBody=(extra={})=>({requestId:'common-key-1',operation:'save',targetWeekdays:[1,2],baselines:[blankBaseline(1),blankBaseline(2)],startMinute:540,endMinute:600,content:'자습',...extra});
const concept=()=>learning.createMobileYouthConcept(ctx,{requestId:'concept-key-1',subject:'math',subunitId:'1-1',content:'소인수분해'});
const check=(id,extra={})=>learning.checkMobileYouthConcept(ctx,'youth-a',id,{requestId:'check-key-1',checked:true,expectedYouthUpdatedAt:h.youth[0].updatedAt.toISOString(),expectedConceptUpdatedAt:h.studyConcept[0].updatedAt.toISOString(),...extra});
const rule=(extra={})=>rules.createMobileYouthRule(ctx,{requestId:'rule-key-1',targetYouthId:'youth-a',category:'생활',detail:'약속을 지켜요',...extra});
describe('youth activities actual server boundaries',()=>{
 beforeEach(()=>f.reset());
 test('full Gregorian query and recurrence preserve 0001..9999, 366 days and 24:00',()=>{
  for(const date of ['0001-01-01','0099-02-28','0100-03-01','2000-02-29','9999-12-31'])assert.equal(core.personalQuery(new URL('https://fixture.invalid?date='+date),'2026-10-04').date,date);
  assert.deepEqual(core.personalQuery(new URL('https://fixture.invalid?month=0099-12'),'2026-10-04'),{date:'0099-12-01',month:'0099-12'});
  for(const query of ['date=0000-01-01','date=0100-02-29','date=2026-10-04&date=2026-10-04','date=%FF','date=%GG','month=2026-10&date=2026-11-01','date='])assert.throws(()=>core.personalQuery(new URL('https://fixture.invalid?'+query),'2026-10-04'));
  const parsed=core.parsePersonalInput(input({selectionMode:'WEEKDAYS',occurrenceDates:[],recurrenceWeekdays:[0,1,2,3,4,5,6],recurrenceStartDate:'0004-01-01',recurrenceEndDate:'0004-12-31',startMinute:1430,endMinute:1440}));assert.equal(parsed.occurrenceDates.length,366);assert.equal(parsed.occurrenceDates.at(-1),'0004-12-31');
  assert.throws(()=>core.parsePersonalInput(input({startMinute:1435,endMinute:1440})));assert.throws(()=>core.parsePersonalInput(input({content:'x'.repeat(201)})));assert.throws(()=>core.parsePersonalInput(input({occurrenceDates:['0004-01-01'],recurrenceStartDate:null,content:3})));
 });
 test('actual routes authenticate before IDs/query/body, private errors carry no redirect',async()=>{
  h.session=null;
  for(const call of [()=>personalRoute.POST(request('/bad/personal-schedules','POST','{'),params('bad:id')),()=>known.GET(request('/personal-schedules/bad?id=0'),params('bad:id')),()=>rulesRoute.GET(request('/rules?page=0')),()=>commonRoute.POST(request('/common-schedules/batch','POST',{}))]){const response=await call();assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('location'),null);assert.equal((await response.json()).code,'UNAUTHORIZED');}
  assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);
 });
 test('actual HTTP strict duplicate JSON, extra query, field types and body budgets',async()=>{
  assert.equal((await known.GET(request('/personal-schedules/id?x=1'),params('id'))).status,400);
  assert.equal((await personalRoute.POST(request('/youth-a/personal-schedules','POST','{"requestId":"same-key-1","requestId":"same-key-2","input":{}}'),params('youth-a'))).status,400);
  assert.equal((await personalRoute.POST(request('/youth-a/personal-schedules','POST',{requestId:'request-1',input:input(),extra:true}),params('youth-a'))).status,400);
  assert.equal((await personalRoute.POST(request('/youth-a/personal-schedules','POST','x'.repeat(65537)),params('youth-a'))).status,413);
  const huge=commonBody({content:'한'.repeat(40000)});const response=await commonRoute.POST(request('/common-schedules/batch','POST',huge));assert.equal(response.status,200);assert.equal(h.youthCommonSchedule[0].content.length,40000);
 });
 test('sixteen independent flags permit basic activities without disclosing private youth fields',async()=>{
  for(let flags=0;flags<16;flags++){Object.assign(h.user[0],{canViewYouthDetails:!!(flags&1),canViewYouthContacts:!!(flags&2),canDownloadYouthDocuments:!!(flags&4),canManageYouth:!!(flags&8)});const result=await schedules.getMobilePersonalSchedules(ctx,'youth-a',new URL('https://fixture.invalid?date=2026-10-04'));assert.equal(result.permissions.canManageYouth,!!(flags&8));assert.equal(result.staffOptions.length,flags&8?1:0);assert.deepEqual(Object.keys(result.youth).sort(),['id','name','admissionDate','dischargeDate','updatedAt'].sort());assert.doesNotMatch(JSON.stringify(result),/phone|birthDate|familyContacts|hasContact|PRIVATE_/);}
  h.user[0].canManageYouth=false;await rejected(create(),403,'FORBIDDEN');h.user[0].role='ADMIN';assert.equal((await create()).ok,true);h.user[0].status='INACTIVE';await rejected(schedules.getMobilePersonalSchedule(ctx,h.youthPersonalSchedule[0].id),401,'UNAUTHORIZED');
 });
 test('fresh permission and operational parent outrank receipt replay for every child read/write',async()=>{
  await create();h.user[0].canManageYouth=false;await rejected(create(),403,'FORBIDDEN');h.user[0].canManageYouth=true;h.youth[0].actualDischargeDate='2026-10-04';await rejected(create(),404,'NOT_FOUND');await rejected(schedules.getMobilePersonalSchedules(ctx,'youth-a',new URL('https://fixture.invalid')),404,'NOT_FOUND');assert.equal(h.youthPersonalSchedule.length,1);
 });
 test('personal immutable request replay creates one child and one audit, different payload conflicts',async()=>{
  const first=await create(),replay=await create();assert.equal(replay.replayed,true);assert.equal(replay.targetId,first.targetId);assert.equal(h.youthPersonalSchedule.length,1);assert.equal(h.auditLog.length,1);await rejected(create('personal-key-1',{content:'새 내용'}),409,'REQUEST_CONFLICT');
 });
 test('personal parent fence prevents parent substitution and stale update before equal content',async()=>{
  const first=await create(),id=first.targetId;const body={requestId:'update-key-1',youthId:'youth-a',expectedUpdatedAt:iso,input:input()};await rejected(schedules.updateMobilePersonalSchedule(ctx,id,{...body,youthId:'youth-b'}),404,'NOT_FOUND');h.youthPersonalSchedule[0].updatedAt=new Date('2026-10-04T00:00:00.001Z');await rejected(schedules.updateMobilePersonalSchedule(ctx,id,body),409,'YOUTH_CONFLICT');assert.equal(h.auditLog.length,1);
 });
 test('personal overlap and audit failure roll back all business rows and receipts',async()=>{
  await create();await rejected(create('overlap-key'),409,'SCHEDULE_CONFLICT');h.auditFailure=true;await assert.rejects(create('audit-fail-key',{startMinute:600,endMinute:660}));assert.equal(h.youthPersonalSchedule.length,1);assert.equal(h.youthMutationReceipt.length,1);assert.equal(h.auditLog.length,1);
 });
 test('hospital staff visit employment, departed staff historical eligibility and retained name snapshot',async()=>{
  h.user.push({...h.user[0],id:'former',name:'당시 직원',status:'INACTIVE',hireDate:'2026-01-01',resignationDate:'2026-10-03'});
  const hospital={content:'',scheduleType:'HOSPITAL',hospitalName:'합성 병원',escortType:'STAFF',escortUserId:'former',occurrenceDates:['2026-10-02']};const first=await create('hospital-key',hospital);assert.equal(first.result.schedule.escortName,'당시 직원');h.user[1].name='새 이름';const row=h.youthPersonalSchedule[0];const changed=await schedules.updateMobilePersonalSchedule(ctx,row.id,{requestId:'hospital-update',youthId:'youth-a',expectedUpdatedAt:row.updatedAt.toISOString(),input:input({...hospital,startMinute:600,endMinute:660})});assert.equal(changed.result.schedule.escortName,'당시 직원');await rejected(create('hospital-ineligible',{...hospital,occurrenceDates:['2026-10-04']}),400,'VALIDATION_ERROR');
  const withoutType=input();delete withoutType.scheduleType;await rejected(schedules.updateMobilePersonalSchedule(ctx,row.id,{requestId:'type-missing-key',youthId:'youth-a',expectedUpdatedAt:changed.result.schedule.updatedAt,input:withoutType}),400,'INVALID_REQUEST');
 });
 test('personal successful delete replay never recreates or deletes a replacement ID',async()=>{
  const first=await create(),body={requestId:'delete-key-1',youthId:'youth-a',expectedUpdatedAt:first.result.schedule.updatedAt};await schedules.deleteMobilePersonalSchedule(ctx,first.targetId,body);await create('replacement-key');const result=await schedules.deleteMobilePersonalSchedule(ctx,first.targetId,body);assert.equal(result.replayed,true);assert.equal(result.outcome,'deleted');assert.equal(h.youthPersonalSchedule.length,1);assert.notEqual(h.youthPersonalSchedule[0].id,first.targetId);
 });
 test('personal create replay after target disappears returns unavailable with zero recreate',async()=>{
  const first=await create();h.youthPersonalSchedule=[];const replay=await create();assert.equal(replay.outcome,'unavailable');assert.equal(replay.targetId,first.targetId);assert.equal(replay.result,null);assert.equal(h.youthPersonalSchedule.length,0);
 });
 test('common vector commits all weekdays, monotonic move and no-op preserves tokens',async()=>{
  const first=await schedules.mutateMobileCommonSchedules(ctx,commonBody());assert.equal(first.result.items.length,2);const baselines=h.youthCommonSchedule.map(row=>({weekday:row.weekday,startMinute:row.startMinute,scheduleId:row.id,expectedUpdatedAt:row.updatedAt.toISOString()}));const noOp=await schedules.mutateMobileCommonSchedules(ctx,commonBody({requestId:'common-noop',baselines}));assert.deepEqual(noOp.result.items.map(row=>row.updatedAt),[iso,iso]);assert.equal(h.auditLog.length,2);const moved=await schedules.mutateMobileCommonSchedules(ctx,commonBody({requestId:'common-move',baselines,startMinute:600,endMinute:660}));assert.ok(moved.result.items.every(row=>row.updatedAt>iso));assert.equal(h.auditLog.length,4);assert.deepEqual(h.locks.filter(lock=>lock.sql.includes('youth-common-weekday')).slice(0,2).map(lock=>lock.values.at(-1)),[1,2]);
 });
 test('common stale/absence ID ABA rejected before same-value equality and rolls vector back',async()=>{
  await schedules.mutateMobileCommonSchedules(ctx,commonBody());const rows=structuredClone(h.youthCommonSchedule),baselines=rows.map(row=>({weekday:row.weekday,startMinute:row.startMinute,scheduleId:row.id,expectedUpdatedAt:iso}));h.youthCommonSchedule[1].id='replacement';await rejected(schedules.mutateMobileCommonSchedules(ctx,commonBody({requestId:'aba-common',baselines})),409,'YOUTH_CONFLICT');assert.equal(h.youthCommonSchedule[0].content,'자습');assert.equal(h.auditLog.length,2);
  await rejected(schedules.mutateMobileCommonSchedules(ctx,commonBody({requestId:'absence-common',baselines:[blankBaseline(1),blankBaseline(2)]})),409,'YOUTH_CONFLICT');
 });
 test('common moving source cannot overwrite an occupied destination, including another batch member',async()=>{
  await schedules.mutateMobileCommonSchedules(ctx,commonBody());h.youthCommonSchedule.push({id:'destination',weekday:2,startHour:10,endHour:11,startMinute:600,endMinute:660,content:'다른 일정',updatedAt:new Date(iso)});const baselines=h.youthCommonSchedule.filter(row=>row.id!=='destination').map(row=>({weekday:row.weekday,startMinute:row.startMinute,scheduleId:row.id,expectedUpdatedAt:iso}));await rejected(schedules.mutateMobileCommonSchedules(ctx,commonBody({requestId:'overlap-common',baselines,startMinute:600,endMinute:660})),409,'SCHEDULE_CONFLICT');assert.ok(h.youthCommonSchedule.every(row=>row.startMinute===540||row.id==='destination'));assert.equal(h.youthMutationReceipt.length,1);
 });
 test('common repeated batch uses committed IDs, not a deleted/recreated coordinate',async()=>{
  const first=await schedules.mutateMobileCommonSchedules(ctx,commonBody());h.youthCommonSchedule[0].id='replacement';const replay=await schedules.mutateMobileCommonSchedules(ctx,commonBody());assert.equal(replay.replayed,true);assert.equal(replay.targetId,first.targetId);assert.equal(replay.result.items.length,1);assert.ok(replay.result.items.every(row=>row.id!=='replacement'));
 });
 test('common delete explicit null baseline no-op is safe, stale ID cannot delete replacement',async()=>{
  await schedules.mutateMobileCommonSchedules(ctx,commonBody());const row=h.youthCommonSchedule[0];h.youthCommonSchedule[0]={...row,id:'new-row'};await rejected(schedules.mutateMobileCommonSchedules(ctx,{requestId:'delete-common',operation:'delete',targetWeekdays:[1],baselines:[{weekday:1,startMinute:540,scheduleId:row.id,expectedUpdatedAt:iso}]}),409,'YOUTH_CONFLICT');assert.equal(h.youthCommonSchedule.length,2);
 });
 test('concept global create replay and strict math/subunit validation',async()=>{
  await concept();assert.equal((await concept()).replayed,true);assert.equal(h.studyConcept.length,1);assert.equal(h.auditLog.length,1);for(const extra of [{subject:'english'},{subunitId:'9-1'},{content:''},{content:'x'.repeat(201)}])await rejected(learning.createMobileYouthConcept(ctx,{requestId:'bad-concept-key',subject:'math',subunitId:'1-1',content:'내용',...extra}),400,extra.content!==undefined?'VALIDATION_ERROR':'INVALID_REQUEST');const page=await learning.getMobileYouthConcepts(ctx,new URL('https://fixture.invalid'));assert.equal(page.curriculum.length,2);
 });
 test('learning desired state requires strict boolean and both parent/concept fences',async()=>{
  const item=await concept();await rejected(check(item.targetId,{checked:'true'}),400,'INVALID_REQUEST');await rejected(check(item.targetId,{expectedYouthUpdatedAt:'2026-01-01T00:00:00.000Z'}),409,'YOUTH_CONFLICT');await rejected(check(item.targetId,{expectedConceptUpdatedAt:'2026-01-01T00:00:00.000Z'}),409,'YOUTH_CONFLICT');assert.equal(h.studyConceptCheck.length,0);
 });
 test('learning check replay does not recheck after another request clears it; parent token blocks ABA',async()=>{
  const item=await concept(),original={requestId:'check-key-1',checked:true,expectedYouthUpdatedAt:iso,expectedConceptUpdatedAt:iso};const first=await learning.checkMobileYouthConcept(ctx,'youth-a',item.targetId,original);assert.ok(first.result.youthUpdatedAt>iso);await check(item.targetId,{requestId:'check-clear',checked:false});const replay=await learning.checkMobileYouthConcept(ctx,'youth-a',item.targetId,original);assert.equal(replay.replayed,true);assert.equal(replay.result.checked,false);assert.equal(h.studyConceptCheck.length,0);await rejected(learning.checkMobileYouthConcept(ctx,'youth-a',item.targetId,{...original,requestId:'stale-check-key'}),409,'YOUTH_CONFLICT');
 });
 test('concept deletion cascades every youth check, stale/delete replay cannot delete new concept',async()=>{
  const item=await concept();await check(item.targetId);await learning.checkMobileYouthConcept(ctx,'youth-b',item.targetId,{requestId:'check-other',checked:true,expectedYouthUpdatedAt:iso,expectedConceptUpdatedAt:iso});assert.equal(h.studyConceptCheck.length,2);await rejected(learning.deleteMobileYouthConcept(ctx,item.targetId,{requestId:'bad-delete-key',expectedUpdatedAt:'2026-01-01T00:00:00.000Z'}),409,'YOUTH_CONFLICT');const body={requestId:'delete-concept',expectedUpdatedAt:iso};await learning.deleteMobileYouthConcept(ctx,item.targetId,body);assert.equal(h.studyConceptCheck.length,0);await learning.createMobileYouthConcept(ctx,{requestId:'new-concept',subject:'math',subunitId:'1-1',content:'새 개념'});await learning.deleteMobileYouthConcept(ctx,item.targetId,body);assert.equal(h.studyConcept.length,1);
 });
 test('learning audit failure rolls check and parent revision back together',async()=>{
  const item=await concept();h.auditFailure=true;await assert.rejects(check(item.targetId));assert.equal(h.youth[0].updatedAt.toISOString(),iso);assert.equal(h.studyConceptCheck.length,0);assert.equal(h.youthMutationReceipt.length,1);
 });
 test('six rule categories, null common parent, strict detail and scope before filtered count',async()=>{
  for(const category of ['생활','학습','외출/외박','안전','상담','기타'])await rule({requestId:'rule-'+category.length+'-'+Math.random().toString(36).slice(2),category});await rule({requestId:'rule-common',targetYouthId:null});h.youth[0].actualDischargeDate='2026-10-04';const list=await rules.getMobileYouthRules(ctx,new URL('https://fixture.invalid?target=all'));assert.equal(list.total,1);assert.equal(list.rules[0].targetYouthId,null);await rejected(rules.getMobileYouthRules(ctx,new URL('https://fixture.invalid?target=youth-a')),404,'NOT_FOUND');assert.throws(()=>core.parseRuleCreate({requestId:'invalid-key',targetYouthId:null,category:'임의',detail:'내용'}));assert.throws(()=>core.parseRuleCreate({requestId:'invalid-key',targetYouthId:null,category:'생활',detail:'x'.repeat(2001)}));
 });
 test('rule strict parent substitution and stale same-target delete preserve row',async()=>{
  const created=await rule();await rejected(rules.deleteMobileYouthRule(ctx,created.targetId,{requestId:'rule-delete-1',targetYouthId:null,expectedUpdatedAt:iso}),404,'NOT_FOUND');await rejected(rules.deleteMobileYouthRule(ctx,created.targetId,{requestId:'rule-delete-2',targetYouthId:'youth-a',expectedUpdatedAt:'2026-01-01T00:00:00.000Z'}),409,'YOUTH_CONFLICT');assert.equal(h.youthRule.length,1);
 });
 test('rule same key returns fresh current rule but never recreates removed target',async()=>{
  const created=await rule();h.youthRule=[];const replay=await rule();assert.equal(replay.replayed,true);assert.equal(replay.outcome,'unavailable');assert.equal(replay.targetId,created.targetId);assert.equal(h.youthRule.length,0);
 });
 test('history projects safe actor/change values and operational target before count',async()=>{
  await rule();await rule({requestId:'common-rule-key',targetYouthId:null});const c=await concept();await check(c.targetId);await schedules.mutateMobileCommonSchedules(ctx,commonBody());for(const row of h.auditLog){row.metadata.secret='PRIVATE_NOTE';row.userAgent='PRIVATE_UA';row.message='PRIVATE_SOURCE_MESSAGE';}
  const common=await histories.getMobileCommonScheduleHistory(ctx,new URL('https://fixture.invalid?weekday=1'));assert.equal(common.logs.length,1);assert.equal(common.logs[0].changes[0].after,'자습');assert.doesNotMatch(JSON.stringify(common),/PRIVATE_|metadata|email|ipAddress/);
  h.youth[0].actualDischargeDate='2026-10-04';const rulesPage=await histories.getMobileYouthRuleHistory(ctx,new URL('https://fixture.invalid?target=all'));assert.equal(rulesPage.total,1);await rejected(histories.getMobileYouthLearningHistory(ctx,'youth-a',new URL('https://fixture.invalid')),404,'NOT_FOUND');
 });
 test('web personal legacy calls use fresh shared permission and preserve input/consumer cache',async()=>{
  const first=await webPersonal.createYouthPersonalScheduleAction('youth-a',input());assert.equal(first.ok,true);assert.ok(h.invalidated.includes('/work-schedule/work-log'));h.authSnapshot=structuredClone(h.user[0]);h.user[0].canManageYouth=false;const result=await webPersonal.updateYouthPersonalScheduleAction(first.data.schedule.id,input({content:'다른 입력'}));assert.equal(result.ok,false);assert.equal(h.youthPersonalSchedule[0].content,'합성 상담');
 });
 test('web common moves/blank deletes use shared transaction, optional vector detects stale state',async()=>{
  assert.equal((await webCommon.saveYouthCommonScheduleAction(1,540,600,'웹 입력',[1,2])).ok,true);const rows=h.youthCommonSchedule.map(row=>({weekday:row.weekday,startMinute:row.startMinute,scheduleId:row.id,expectedUpdatedAt:iso}));h.youthCommonSchedule[1].id='new-same-coordinate';assert.equal((await webCommon.saveYouthCommonScheduleAction(1,540,600,'웹 입력',[1,2],540,{baselines:rows})).ok,false);assert.equal((await webCommon.saveYouthCommonScheduleAction(1,540,600,'',[1,2])).ok,true);assert.equal(h.youthCommonSchedule.length,0);
 });
 test('web desired checks update parent fence and concept form errors preserve content',async()=>{
  const bad=new FormData();bad.set('content','x'.repeat(201));const state=await webLearning.createYouthStudyConceptAction('math','1-1',{},bad);assert.equal(state.values.content.length,201);const good=new FormData();good.set('content','기존 웹 개념');assert.equal((await webLearning.createYouthStudyConceptAction('math','1-1',{},good)).success,'개념을 추가했습니다.');assert.equal((await webLearning.toggleYouthStudyConceptCheckAction(h.studyConcept[0].id,'youth-a',true)).ok,true);assert.ok(h.youth[0].updatedAt.toISOString()>iso);const empty=new FormData();await webLearning.deleteYouthStudyConceptAction(h.studyConcept[0].id,empty);assert.equal(h.studyConceptCheck.length,0);
 });
 test('web rules keep Next redirect control flow outside mutation catches',async()=>{
  const form=new FormData();form.set('category','생활');form.set('detail','규칙');await assert.rejects(webRules.createYouthRuleAction(form),error=>error.digest?.includes('/youth/rules;'));assert.equal(h.youthRule.length,1);await assert.rejects(webRules.deleteYouthRuleAction(h.youthRule[0].id),error=>error.digest?.includes('/youth/rules;'));assert.equal(h.youthRule.length,0);
 });
 test('shared retry rereads fresh actor and rollback prevents duplicate child/audit',async()=>{
  h.txErrors=1;const result=await create();assert.equal(result.ok,true);assert.equal(h.youthPersonalSchedule.length,1);assert.equal(h.auditLog.length,1);assert.equal(h.transactions.length,2);h.beforeTx=()=>{h.user[0].status='INACTIVE';};await rejected(create('next-key-1',{startMinute:600,endMinute:660}),401,'UNAUTHORIZED');assert.equal(h.youthPersonalSchedule.length,1);
 });
 test('actual check route strict fields returns canonical token without raw receipt metadata',async()=>{
  const c=await concept();const response=await learningRoute.PUT(request('/youth-a/learning/checks/'+c.targetId,'PUT',{requestId:'route-check-key',checked:true,expectedYouthUpdatedAt:iso,expectedConceptUpdatedAt:iso}),params('youth-a',{conceptId:c.targetId}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.checked,true);assert.doesNotMatch(JSON.stringify(data),/payloadHash|committedTargetsJson|PRIVATE_/);assert.equal(response.headers.get('cache-control'),'private, no-store');
 });
 test('actual permission exception is typed403 with zero writes, exact redirect rethrows and unknown errors remain503',async()=>{
  h.user[0].canManageYouth=false;
  const actions=[()=>webPersonal.createYouthPersonalScheduleAction('youth-a',input()),()=>webPersonal.updateYouthPersonalScheduleAction('old',input()),()=>webPersonal.deleteYouthPersonalScheduleAction('old'),()=>webCommon.saveYouthCommonScheduleAction(1,540,600,'내용',[1]),()=>webCommon.deleteYouthCommonScheduleAction(1,540),()=>webLearning.toggleYouthStudyConceptCheckAction('concept','youth-a',true),()=>webLearning.createYouthStudyConceptClientAction({subject:'math',subunitId:'1-1',content:'내용'},'key-concept-a','actor'),()=>webLearning.deleteYouthStudyConceptClientAction('concept',{requestId:'key-delete-a',expectedUpdatedAt:iso,expectedActorId:'actor'}),()=>webRules.createYouthRuleClientAction({category:'생활',detail:'내용',targetYouthId:null},'key-rule-a','actor'),()=>webRules.deleteYouthRuleClientAction('rule',{requestId:'key-delete-r',targetYouthId:null,expectedUpdatedAt:iso,expectedActorId:'actor'}),()=>load('app/youth/activity-actions.ts').getYouthActivityReceiptAction('key-receipt-a','actor')];
  for(const action of actions){const result=await action();assert.equal(result.ok,false);assert.equal(result.status,403);assert.equal(result.code,'FORBIDDEN');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|phone|birthDate|familyContact|stack/);}
  assert.equal(h.writes.length,0);assert.equal(h.transactions.length,0);
  const redirect=Object.assign(Error('NEXT_REDIRECT'),{digest:'NEXT_REDIRECT;replace;/login;307;'});h.authError=redirect;
  for(const action of actions)await assert.rejects(action(),error=>error===redirect);
  h.authError=Object.assign(Error('PRIVATE_PROVIDER_ERROR'),{code:'OTHER_PERMISSION_ERROR'});
  for(const action of actions){const result=await action();assert.equal(result.status,503);assert.equal(result.code,'REQUEST_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_ERROR/);}
 });

});
