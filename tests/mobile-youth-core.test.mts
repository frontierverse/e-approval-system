import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../mobile/src/lib/api';
import { isYouthActivityResult } from '../mobile/src/lib/youth-activities';
import { clearYouthResources, registerYouthResource, youthPrivacyGeneration } from '../mobile/src/lib/youth-privacy';
import { isYouthBasicDetail, isYouthContactsView, isYouthDate, isYouthDetailsView, isYouthMutation, isYouthPermissions, youthDisclosureCurrent, youthDisclosureDeadline, youthPage, youthProfilePatch, youthScalar, youthUnknown } from '../mobile/src/lib/youth';
const iso='2026-10-04T00:00:00.000Z',later='2026-10-04T00:05:00.000Z';
const permissions={canViewYouthBasic:true,canViewYouthDetails:true,canViewYouthContacts:true,canDownloadYouthDocuments:false,canManageYouth:true,canDeleteYouth:false};
const basic={id:'youth',name:'합성 청소년',admissionDate:null,dischargeDate:'2026-10-04',updatedAt:iso};
const envelope={ok:true,replayed:false,today:'2026-10-04',permissions,youthId:'youth',sourceUpdatedAt:iso,auditedAt:'2026-10-03T23:40:00.000Z',serverNow:iso,disclosureUntil:later};
test('basic allowlist and four independent permissions never infer private read from manage',()=>{
 for(let bits=0;bits<16;bits++){const p={...permissions,canViewYouthDetails:!!(bits&1),canViewYouthContacts:!!(bits&2),canDownloadYouthDocuments:!!(bits&4),canManageYouth:!!(bits&8)};assert.ok(isYouthPermissions(p));}
 assert.ok(isYouthBasicDetail({today:'2026-10-04',permissions,youth:basic},'youth'));
 for(const field of ['birthDate','phone','hasContact','documentCount','storageKey'])assert.equal(isYouthBasicDetail({today:'2026-10-04',permissions,youth:{...basic,[field]:null}}),false);
 assert.equal(isYouthPermissions({...permissions,canDeleteYouth:true}),false);
});
test('strict query and full Gregorian dates never choose another subject implicitly',()=>{
 assert.equal(youthScalar(['youth']), '');assert.equal(youthScalar(undefined),undefined);assert.equal(youthPage('100001'),100001);
 for(const v of ['0','01',' 1','1.0',['1']])assert.equal(youthPage(v),null);
 for(const date of ['0001-01-01','0099-02-28','2000-02-29','9999-12-31'])assert.ok(isYouthDate(date));
 for(const date of ['0000-01-01','1900-02-29','2026-2-01','10000-01-01'])assert.equal(isYouthDate(date),false);
});
test('detail old audit collapse does not shorten or extend first logical five-minute window',()=>{
 const details={birthDate:null,age:null,koreanAge:null,initialDischargeDate:null,dischargeExtensions:[]};assert.ok(isYouthDetailsView({...envelope,details},'youth'));
 const deadline=youthDisclosureDeadline(envelope,100);assert.equal(deadline,300100);assert.ok(youthDisclosureCurrent(deadline,300099));assert.equal(youthDisclosureCurrent(deadline,300100),false);
 assert.equal(isYouthDetailsView({...envelope,disclosureUntil:'2026-10-04T00:05:00.001Z',details},'youth'),false);
 assert.equal(isYouthDetailsView({...envelope,permissions:{...permissions,canViewYouthDetails:false},details},'youth'),false);
 assert.equal(isYouthDetailsView({...envelope,youthId:'foreign',details},'youth'),false);
 assert.equal(isYouthContactsView({...envelope,contacts:{phone:null,familyContacts:[]}},'youth'),true);
});
test('edit normalization omits unrevealed fields and preserves original extended discharge',()=>{
 const d={name:basic.name,admissionDate:'',dischargeDate:'2026-10-09',birthDate:'',phone:'',familyContacts:[{relationship:'',phone:''}]};assert.deepEqual(youthProfilePatch(d,basic),{});
 assert.deepEqual(youthProfilePatch({...d,name:'새 이름'},basic),{name:'새 이름'});
 assert.deepEqual(youthProfilePatch(d,basic,{birthDate:'2008-01-01',contacts:{phone:'010-1234-5678',familyContacts:[]}}),{birthDate:null,phone:null});
 assert.equal(Object.hasOwn(youthProfilePatch(d,basic),'dischargeDate'),false);
});
test('receipt validates original request/operation and unavailable proof never echoes private source token',()=>{
 const receipt={ok:true,replayed:true,requestId:'key-original',operation:'profile.create',targetType:'Youth',targetId:'youth',youthId:'youth',outcome:'unavailable',committedAt:iso,committedUpdatedAt:null,result:null};
 assert.ok(isYouthMutation(receipt,{operation:'profile.create',requestId:'key-original'}));
 assert.equal(isYouthMutation(receipt,{operation:'profile.create',requestId:'another-key'}),false);
 assert.equal(isYouthMutation({...receipt,targetType:'YouthDecisionDocument'},{operation:'profile.create',requestId:'key-original'}),false);
 assert.equal(isYouthMutation(receipt,{operation:'profile.create',requestId:'key-original',youthId:'foreign'}),false);
 assert.equal(isYouthMutation({...receipt,committedUpdatedAt:iso},{operation:'profile.create',requestId:'key-original'}),false);
 for(const status of [0,200,201,202,204,408,409,500,503])assert.ok(youthUnknown(new ApiError('合成',status)));
 for(const status of [400,401,403,404,413,415])assert.equal(youthUnknown(new ApiError('合成',status)),false);
});
test('old-token scoped cleanup synchronously invalidates only old-account private callbacks',async()=>{
 let old=0,newer=0;const a=registerYouthResource('old',()=>{old++;}),b=registerYouthResource('new',()=>{newer++;});
 const oldGeneration=youthPrivacyGeneration('old'),newGeneration=youthPrivacyGeneration('new');
 const pending=clearYouthResources({expectedToken:'old'});assert.equal(old,1);assert.equal(newer,0);assert.notEqual(youthPrivacyGeneration('old'),oldGeneration);assert.equal(youthPrivacyGeneration('new'),newGeneration);await pending;
 await clearYouthResources();assert.equal(newer,1);a();b();
});

test('personal delete proof accepts only exact public youth basic and schedule ID fields',()=>{
 assert.ok(isYouthActivityResult({youth:basic,scheduleId:'personal'}));
 assert.equal(isYouthActivityResult({youth:{...basic,birthDate:'2010-01-01'},scheduleId:'personal'}),false);
 assert.equal(isYouthActivityResult({youth:{...basic,updatedAt:'invalid'},scheduleId:'personal'}),false);
 assert.equal(isYouthActivityResult({youth:basic,scheduleId:''}),false);
 assert.equal(isYouthActivityResult({youth:basic,scheduleId:'personal',storageKey:'private'}),false);
});
