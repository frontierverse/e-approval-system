import assert from "node:assert/strict";
import test from "node:test";
import { createActivityUI, settle, text } from "./helpers/youth-activity-ui.mjs";

const base = { id:"youth-a", name:"가상 청소년", admissionDate:"2020-01-01", dischargeDate:"2020-06-01", actualDischargeDate:"2020-06-01", caseClosedDate:"2020-07-01", retentionUntil:"2025-07-01", retentionBasis:"기준", retentionHoldReason:null, retentionVersion:0, purgeStartedAt:null, purgedAt:null, decisionDocumentCount:2 };
const progress = { phase:"waiting-provider", blockedReason:"WRITE_PENDING", lastCheckedAt:"2026-10-01T00:00:00.000Z", nextCheckAt:"2026-10-02T00:00:00.000Z", leaseUntil:null, canRetry:false };
function fixture(record = base) {
  const h = createActivityUI("retention", {data:[record],today:"2026-10-01", save:(...args)=>h.request("save")(...args), purge:(...args)=>h.request("purge")(...args), read:(...args)=>h.request("read")(...args), refresh:()=>h.request("refresh")()});
  return h;
}
function open(h, name = "가상 청소년 개인정보 파기") { h.find("button",name).props.onClick({ currentTarget:{id:"synthetic-trigger"} }); }
async function consent(h) {
  open(h); await settle();
  h.all("input").find(n=>n.props.type==="checkbox").props.onChange({target:{checked:true}});
  h.all("input").find(n=>n.props.autoComplete==="off").props.onChange({target:{value:"가상 청소년"}});
  await settle();
}
function submit(h) { h.find("form").props.onSubmit({preventDefault(){},currentTarget:{fields:{}}}); }
function statuses(h) { return h.all("p").filter(n=>n.props.role==="status").map(text).join(" "); }

test("pending purge releases the spinner, hides private actions and never claims physical completion", async()=>{
  const h=fixture(); await consent(h);
  const form=h.find("form"); form.props.onSubmit({preventDefault(){},currentTarget:{fields:{}}}); form.props.onSubmit({preventDefault(){},currentTarget:{fields:{}}});
  await settle(); assert.equal(h.requests.filter(r=>r.name==="purge").length,1);
  h.resolve({ok:true,data:[{...base,retentionVersion:1,purgeStartedAt:progress.lastCheckedAt,purgeProgress:progress}],purgeOutcome:{status:"pending",youthId:base.id,retentionVersion:1,progress}},"purge");
  await settle();
  assert.match(statuses(h),/파기 요청을 접수/); assert.doesNotMatch(statuses(h),/파기했습니다/);
  assert.equal(h.all("AppModal").length,0);
  assert.equal(h.all("button").some(n=>n.props["aria-label"]==="가상 청소년 보존 기록 열람"),false);
  assert.equal(h.find("button","가상 청소년 파기 상태 확인").props.disabled,undefined);
  assert.match(text(h.tree),/파일 전송 종료/); h.destroy();
});

test("a claimed complete outcome without a persisted purged record is not a success message", async()=>{
  const h=fixture(); await consent(h); submit(h); await settle();
  h.resolve({ok:true,data:[base],purgeOutcome:{status:"complete",youthId:base.id,retentionVersion:2,progress:{...progress,phase:"completed"}}},"purge"); await settle();
  assert.match(statuses(h),/파기 요청을 접수/); assert.doesNotMatch(statuses(h),/파기했습니다/); h.destroy();
});

test("persisted physical completion remains compatible with an older record-only adapter", async()=>{
  const h=fixture(); await consent(h); submit(h); await settle();
  h.resolve({ok:true,data:[{...base,purgedAt:"2026-10-01T00:01:00.000Z",name:"파기된 기록 youth-a"}]},"purge"); await settle();
  assert.match(statuses(h),/파기했습니다/); assert.doesNotMatch(text(h.tree),/가상 청소년/); h.destroy();
});

test("purge validation failure preserves the consent and name and focuses the error", async()=>{
  const h=fixture(); await consent(h); submit(h); await settle();
  h.resolve({ok:false,error:"기록이 변경되었습니다. 새로고침 후 다시 확인하세요."},"purge"); await settle();
  assert.equal(h.all("AppModal").length,1);
  assert.equal(h.all("input").find(n=>n.props.autoComplete==="off").props.value,"가상 청소년");
  assert.equal(h.all("input").find(n=>n.props.type==="checkbox").props.checked,true);
  assert.equal(h.all("p").some(n=>n.props.role==="alert"),true);
  assert.equal(h.events.some(e=>e.kind==="focus"),true); h.destroy();
});

test("status modal refreshes a projection without dispatching purge and prevents duplicate refresh", async()=>{
  const h=fixture({...base,purgeStartedAt:progress.lastCheckedAt,purgeProgress:progress});
  open(h,"가상 청소년 파기 상태 확인"); await settle();
  assert.equal(h.all("input").some(n=>n.props.type==="checkbox"),false);
  const buttons=h.all("button").filter(n=>text(n)==="상태 새로고침");
  buttons.at(-1).props.onClick(); buttons.at(-1).props.onClick(); submit(h); await settle();
  assert.equal(h.requests.length,1); assert.equal(h.requests[0].name,"refresh");
  h.resolve({ok:true,data:[{...base,purgeStartedAt:progress.lastCheckedAt,retentionVersion:9,purgeProgress:{...progress,blockedReason:"LEGACY_WRITER_UNTRACKED"}}]},"refresh"); await settle();
  assert.match(text(h.tree),/기존 파일 전송의 종료 확인/);
  assert.equal(h.all("button").some(n=>text(n)==="승인된 파기 재점검"),false);
  assert.equal(h.requests.filter(r=>r.name==="purge").length,0); h.destroy();
});

test("retryable status uses the freshly read version and keeps explicit administrator consent", async()=>{
  const h=fixture({...base,purgeStartedAt:progress.lastCheckedAt,retentionVersion:7,purgeProgress:{...progress,phase:"retryable",blockedReason:"PURGE_RETRY_REQUIRED",canRetry:true}});
  open(h,"가상 청소년 파기 상태 확인"); await settle(); h.find("button","승인된 파기 재점검").props.onClick(); await settle();
  assert.equal(h.all("input").find(n=>n.props.type==="checkbox").props.checked,false);
  h.all("input").find(n=>n.props.type==="checkbox").props.onChange({target:{checked:true}});
  h.all("input").find(n=>n.props.autoComplete==="off").props.onChange({target:{value:"가상 청소년"}}); await settle(); submit(h); await settle();
  assert.equal(h.pending("purge").args[1].version,7);
  assert.equal(h.pending("purge").args[1].reviewedCopies,true);
  assert.equal(h.pending("purge").args[1].confirmationName,"가상 청소년");
  h.resolve({ok:false,error:"점검 대기"},"purge"); await settle(); h.destroy();
});
