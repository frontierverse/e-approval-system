import assert from "node:assert/strict";
import { test } from "node:test";
import { youthPurgeHarness } from "./helpers/youth-purge.mjs";

// All DAL/mutation/queue logic runs from the actual source through lexical ports.
test("fresh ACTIVE actual ADMIN and uncached public session veto precede any purge change", async () => {
  for (const change of [{ role: "USER" }, { status: "INACTIVE" }]) {
    const s=youthPurgeHarness(), row=s.parent();Object.assign(s.h.tables.user[0],change);
    await assert.rejects(s.request(row),{code:"FORBIDDEN"});assert.equal(row.purgeStartedAt,null);assert.equal(s.h.removed.length,0);assert.equal(s.h.tables.auditLog.length,0);
  }
  const s=youthPurgeHarness(),row=s.parent();let calls=0;
  await assert.rejects(s.request(row,{...s.context,authorize:async()=>{calls++;throw new s.domain.YouthPurgeError("expired","FORBIDDEN");}}),{code:"FORBIDDEN"});
  assert.equal(calls,1);assert.equal(row.purgeStartedAt,null);
});
test("administrator name/version/copy/retention/settlement guards remain unchanged",async()=>{
  for(const change of [{actualDischargeDate:null},{caseClosedDate:null},{retentionUntil:"9999-12-31"},{retentionHoldReason:"법원"},{mathSettlement:null},{mathSettlement:{reopenedAt:new Date()}},{purgeLeaseUntil:new Date("9999-01-01")}]){
    const s=youthPurgeHarness(),row=s.parent();Object.assign(row,change);await assert.rejects(s.request(row));assert.equal(s.h.removed.length,0);assert.equal(row.purgeStartedAt,null);
  }
  for(const change of[{confirmationName:"other"},{reviewedCopies:false},{version:1}]){const s=youthPurgeHarness(),row=s.parent();await assert.rejects(s.domain.requestYouthPurge(s.context,row.id,{...s.input(row),...change}));assert.equal(s.h.removed.length,0);}
});
test("known tracked server files complete only after exact queue proof and atomic PII/ledger scrub",async()=>{
  const s=youthPurgeHarness(),row=s.parent();s.parent("youth-2");
  s.h.tables.youthViewRequest.push({id:"view-1",actorId:"admin",requestId:"view-request-1",youthId:row.id,state:"recorded",sourceUpdatedAt:s.h.now,requestHash:"b".repeat(64),sourceFileUpdatedAt:s.h.now,auditLogId:"audit-1",auditedAt:s.h.now,disclosureUntil:s.h.now});
  s.h.tables.dailyWorkReport.push({id:"report",version:1,mainContent:"別도自由文本",youthReports:[{youthId:row.id,youthName:row.name,content:"개인 기록"},{youthId:"youth-2",youthName:"다른 합성",content:"보존"}]});
  s.h.tables.mathResult.push({id:"math",studentId:row.id,amount:3000,memo:row.name});s.h.tables.mathVaultLog.push({id:"vault",studentId:row.id,amount:5000,memo:row.name});
  const result=await s.request(row);assert.equal(result.status,"complete");const after=s.h.tables.youth.find(v=>v.id===row.id);assert.ok(after.purgedAt);assert.equal(after.phone,null);assert.equal(after.birthDate,null);for(const key of["admissionDate","age","initialDischargeDate","dischargeDate","phone","familyContact","familyRelationship","familyPhone","actualDischargeDate","caseClosedDate","retentionUntil","retentionBasis","retentionHoldReason"])assert.equal(after[key],null,key);
  for(const table of["youthFamilyContact","youthSpecialNote","youthDischargeExtension","youthAcademySchedule","youthPersonalSchedule","youthLearningSchedule","studyConceptCheck","youthRule"])assert.equal(s.h.tables[table].filter(v=>v.youthId===row.id).length,0,table);
  assert.equal(s.h.tables.youthMutationReceipt[0].state,"purged");assert.equal(s.h.tables.youthMutationReceipt[0].payloadHash,null);assert.equal(s.h.tables.youthMutationReceipt[0].requestId,"create-youth-1");
  assert.equal(s.h.tables.youthViewRequest[0].sourceUpdatedAt,null);assert.equal(s.h.tables.youthViewRequest[0].requestHash,null);assert.equal(s.h.tables.youthDecisionUpload[0].state,"purged");assert.equal(s.h.tables.youthDecisionUpload[0].finalKey,null);
  assert.ok(s.h.tables.youthDecisionFileCleanup.every(v=>v.state==="done"));assert.equal(s.h.tables.youthDecisionDocument.some(v=>v.youthId===row.id),false);assert.ok(s.h.objects.has("final-youth-2"));
  assert.equal(s.h.tables.mathResult[0].amount,3000);assert.equal(s.h.tables.mathResult[0].memo,null);assert.equal(s.h.tables.mathVaultLog[0].amount,5000);assert.equal(s.h.tables.dailyWorkReport[0].mainContent,"別도自由文本");assert.equal(s.h.tables.dailyWorkReport[0].youthReports.length,1);
  assert.doesNotMatch(JSON.stringify(result),/합성|storageKey|originalName|010-/);
});
test("issued grant expiry/absence and unknown writer never certify completion; late objects are deleted again",async()=>{
  for(const evidence of[{lastGrantExpiresAt:new Date("2020-01-01")},{hadUnknownWrite:true,finalizeWriteEvidence:"unknown"}]){
    const s=youthPurgeHarness(),row=s.parent();Object.assign(s.h.tables.youthDecisionUpload[0],evidence);
    let result=await s.request(row);assert.equal(result.status,"pending");assert.equal(result.progress.blockedReason,"WRITE_PENDING");assert.equal(s.h.tables.youth[0].purgedAt,null);assert.ok(s.h.tables.youth[0].purgeStartedAt);
    assert.ok(s.h.tables.youthDecisionFileCleanup.some(v=>v.state==="pending"));const before=s.h.removed.length;s.h.objects.add("stage-youth-1");s.h.now=new Date(s.h.now.getTime()+3600001);
    result=await s.request(s.h.tables.youth[0]);assert.equal(result.status,"pending");assert.equal(s.h.objects.has("stage-youth-1"),false);assert.ok(s.h.removed.length>before);assert.ok(s.h.tables.youthDecisionFileCleanup.some(v=>v.state==="pending"));
  }
});
test("legacy no-file inventory and untracked current documents remain explicitly pending",async()=>{
  for(const files of[false,true]){const s=youthPurgeHarness(),row=s.parent("youth-1",{tracked:false,files});const result=await s.request(row);assert.equal(result.status,"pending");assert.equal(result.progress.blockedReason,"LEGACY_WRITER_UNTRACKED");assert.equal(result.progress.canRetry,false);assert.equal(s.h.tables.youth[0].purgedAt,null);}
});
test("other live owner and a different purging parent never acquire the own-purge reference exception",async()=>{
  for(const owner of["profile","signature","other-youth"]){const s=youthPurgeHarness(),row=s.parent();if(owner==="other-youth"){const other=s.parent("youth-2");other.purgeStartedAt=s.h.now;s.h.tables.youthDecisionDocument[1].storageKey="final-youth-1";}else{s.h.tables.user[0][owner+"ImageStorageProvider"]="local";s.h.tables.user[0][owner+"ImageStorageKey"]="final-youth-1";}
    const result=await s.request(row);assert.equal(result.status,"pending");assert.equal(result.progress.blockedReason,"LIVE_REFERENCE");assert.ok(s.h.objects.has("final-youth-1"));assert.ok(!s.h.removed.includes("final-youth-1"));}
});
test("final audit rollback preserves PII and opaque ledgers; the same pending purge can later complete",async()=>{
  const s=youthPurgeHarness(),row=s.parent();s.h.failFinalAudit=true;const result=await s.request(row);assert.equal(result.status,"pending");assert.equal(result.progress.blockedReason,"PURGE_RETRY_REQUIRED");assert.equal(s.h.tables.youth[0].phone,"010-1111-2222");assert.equal(s.h.tables.youthMutationReceipt[0].state,"committed");assert.equal(s.h.tables.youthDecisionUpload[0].state,"consumed");assert.equal(s.h.tables.youthDecisionUpload[0].finalKey,"final-youth-1");
  s.h.failFinalAudit=false;s.h.now=new Date(s.h.now.getTime()+3600001);assert.equal((await s.request(s.h.tables.youth[0])).status,"complete");
});
test("stale lease/version completion cannot scrub or release the newer claim",async()=>{
  const s=youthPurgeHarness(),row=s.parent();let moved=false;s.h.afterDelete=async()=>{if(!moved){moved=true;const current=s.h.tables.youth[0];current.retentionVersion+=1;current.purgeLeaseUntil=new Date(s.h.now.getTime()+600000);}};
  const result=await s.request(row);assert.equal(result.status,"pending");assert.equal(result.progress.phase,"running");assert.equal(s.h.tables.youth[0].purgedAt,null);assert.equal(s.h.tables.youth[0].phone,"010-1111-2222");assert.equal(s.h.tables.youth[0].purgeLeaseUntil.getTime(),s.h.now.getTime()+600000);
});
test("pure status has no queue, grant, or business write and reflects safe progress only",async()=>{
  const s=youthPurgeHarness(),row=s.parent("youth-1",{tracked:false,files:false});await s.request(row);const before=s.h.writes,removed=s.h.removed.length;const status=await s.domain.getYouthPurgeStatus(s.context,row.id);assert.equal(s.h.writes,before);assert.equal(s.h.removed.length,removed);assert.doesNotMatch(JSON.stringify(status),/합성|storageKey|birthDate|phone/);
});
test("trusted maintenance resumes only recorded starts, checks current settlement, and fairly advances pending parents",async()=>{
  const s=youthPurgeHarness();s.parent("due-unrequested",{files:false});
  for(let i=0;i<3;i++){const row=s.parent("pending-"+i,{tracked:false,files:false});await s.request(row);s.h.tables.youth.find(v=>v.id===row.id).purgeNextCheckAt=null;}
  const bad=s.parent("invalid-settlement",{files:false});bad.purgeStartedAt=s.h.now;bad.mathSettlement.reopenedAt=s.h.now;
  s.h.tables.auditLog.push({id:"approved-invalid",actorId:"admin",action:"UPDATE_YOUTH",targetType:"YouthRetention",targetId:bad.id,metadata:{changeType:"youth.retention.purgeStarted",copiesReviewed:true}});
  const unapproved=s.parent("unapproved",{files:false});unapproved.purgeStartedAt=s.h.now;
  const result=await s.domain.reconcileYouthPurgeMaintenance({db:s.db,now:()=>s.h.now,storage:s.context.storage},{limit:10,budgetMs:10000});assert.deepEqual(result,{checked:5,completed:0,pending:5});assert.equal(s.h.tables.youth.find(v=>v.id==="due-unrequested").purgeStartedAt,null);assert.equal(s.h.tables.youth.find(v=>v.id===bad.id).purgedAt,null);assert.equal(s.h.tables.youth.find(v=>v.id===unapproved.id).purgeBlockedReason,"PURGE_RETRY_REQUIRED");
  assert.equal((await s.domain.reconcileYouthPurgeMaintenance({db:s.db,now:()=>s.h.now,storage:s.context.storage},{limit:10})).checked,0);
});
test("cancellation before candidate/claim never starts or deletes any record",async()=>{
  const s=youthPurgeHarness(),row=s.parent();const controller=new AbortController();controller.abort();await assert.rejects(s.domain.reconcileYouthPurgeMaintenance({db:s.db,now:()=>s.h.now,storage:s.context.storage},{signal:controller.signal}));assert.equal(row.purgeStartedAt,null);assert.equal(s.h.removed.length,0);
});

test("session expiry or actor downgrade after accepted file deletion vetoes final PII/receipt scrub",async()=>{
  for(const change of["session","status","role"]){const s=youthPurgeHarness(),row=s.parent();let current=true;s.h.afterDelete=async()=>{if(change==="session")current=false;else s.h.tables.user[0][change]=change==="status"?"INACTIVE":"USER";};
    await assert.rejects(s.request(row,{...s.context,authorize:async()=>{if(!current)throw new s.domain.YouthPurgeError("expired","FORBIDDEN");}}),{code:"FORBIDDEN"});
    assert.ok(s.h.tables.youth[0].purgeStartedAt);assert.equal(s.h.tables.youth[0].purgedAt,null);assert.equal(s.h.tables.youth[0].phone,"010-1111-2222");assert.equal(s.h.tables.youthMutationReceipt[0].state,"committed");assert.equal(s.h.tables.auditLog.some(v=>v.metadata.changeType==="youth.retention.purged"),false);
  }
});
test("backoff eligibility controls safe canRetry and early manual retries",async()=>{
 const s=youthPurgeHarness(),row=s.parent();s.h.failFinalAudit=true;const result=await s.request(row);assert.equal(result.progress.canRetry,false);await assert.rejects(s.request(s.h.tables.youth[0]),{code:"PURGE_CONFLICT"});s.h.now=new Date(s.h.now.getTime()+3600001);assert.equal((await s.domain.getYouthPurgeStatus(s.context,row.id)).progress.canRetry,true);
});
test("purged opaque request tombstones cannot create a new Youth under the same actor/key",async()=>{
 const s=youthPurgeHarness(),row=s.parent("youth-1",{files:false});assert.equal((await s.request(row)).status,"complete");
 await assert.rejects(s.load("lib/youth-mobile-mutations.ts").createMobileYouth(s.context,{requestId:"create-youth-1",name:"合成 retry",admissionDate:"2020-01-01",dischargeDate:"9999-12-31",birthDate:"2005-02-03",phone:null,familyContacts:[],uploadIds:[]}),{code:"REQUEST_CONFLICT"});assert.equal(s.h.tables.youth.length,1);
});
