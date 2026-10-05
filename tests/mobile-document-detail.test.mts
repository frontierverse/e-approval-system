import assert from "node:assert/strict";
import { test } from "node:test";
import { currentRejectedStep, decisionCommentError, documentActions, detailDate, latestDocumentHistories, stepActorName, stepStatusLabel } from "../mobile/src/lib/document-detail.ts";

const step = {id:"step", order:1, name:"원 결재자", status:"approved", actedAt:"2026-10-01T15:30:00Z", comment:null};

test("proxy decisions show the actual actor instead of attributing rejection to the previous proxy", () => {
  const proxy = {...step, decisionType:"PROXY", proxyApprovedByName:"대리 승인자"};
  assert.equal(stepStatusLabel(proxy), "대리 승인");
  assert.equal(stepActorName(proxy), "대리 승인자");
  const rejected = {...proxy, status:"rejected", decisionType:"PROXY_REJECT", actedByName:"상위 결재자"};
  assert.equal(stepStatusLabel(rejected), "대리결재 반려");
  assert.equal(stepActorName(rejected), "상위 결재자");
  assert.equal(stepActorName({...rejected, actedByName:null}), null);
  assert.equal(stepActorName({...step, status:"waiting"}), null);
  assert.equal(stepStatusLabel({...step, status:"waiting"}), "차례 대기");
  assert.equal(stepActorName(step), "원 결재자");
});

test("the prominent rejection belongs to the current rejected cycle, never an old rejection after resubmission", () => {
  const old = {...step, id:"old", status:"rejected", comment:"지난 반려 사유"};
  const latest = {...old, id:"latest", order:2, actedAt:"2026-10-02T01:00:00Z", comment:"현재 반려 사유\n두 번째 줄"};
  const document = {status:"rejected", approvalSteps:[old, latest]};
  assert.equal(currentRejectedStep(document)?.comment, latest.comment);
  for (const status of ["submitted", "in_progress", "approved", "recalled", "draft"]) {
    assert.equal(currentRejectedStep({...document, status}), undefined);
  }
  assert.equal(currentRejectedStep({status:"rejected", approvalSteps:[]}), undefined);
  assert.deepEqual(document.approvalSteps, [old, latest]);
});

test("history uses timestamps across offsets, preserves the source, and dates distinguish years in Korea", () => {
  const histories = [
    {id:"1", action:"제출", actorName:"직원", createdAt:"2026-10-02T08:30:00+09:00", description:""},
    {id:"2", action:"승인", actorName:"시설장", createdAt:"2026-10-02T00:00:00Z", description:""},
  ];
  assert.deepEqual(latestDocumentHistories(histories).map(row => row.id), ["2", "1"]);
  assert.deepEqual(histories.map(row => row.id), ["1", "2"]);
  assert.deepEqual(latestDocumentHistories(), []);
  assert.match(detailDate("2025-12-31T15:30:00Z"), /^2026\.\s*1\.\s*1\..*00:30/);
  for (const date of [null, undefined, "invalid"]) assert.equal(detailDate(date), "시간 기록 없음");
});


test("decision comments validate trimmed bounds while keeping the original input intact", () => {
  assert.equal(decisionCommentError("approve", "  "), null);
  assert.ok(decisionCommentError("reject", " 보 "));
  assert.equal(decisionCommentError("reject", " 보완 "), null);
  assert.equal(decisionCommentError("reject", "가".repeat(2000)), null);
  assert.ok(decisionCommentError("approve", "가".repeat(2001)));
});

test("document actions require both employee capability and server grants in the matching lifecycle", () => {
  const document = {status:"submitted",canDecide:true,canRecall:true,canEdit:true,updatedAt:"2026-10-05T00:12:00Z",decisionBlockedReason:null};
  assert.deepEqual(documentActions(document, true), {canDecide:true,canRecall:true,canEdit:false,canDelete:false});
  assert.equal(documentActions(document, false).canDecide, false);
  assert.equal(documentActions({...document, canDecide:false}, true).canDecide, false);
  assert.equal(documentActions({...document, decisionBlockedReason:"미지원 첨부"}, true).canDecide, false);
  assert.equal(documentActions({...document, updatedAt:undefined}, true).canRecall, false);
  for (const status of ["approved","rejected","discarded"]) assert.deepEqual(documentActions({...document,status}, true), {canDecide:false,canRecall:false,canEdit:false,canDelete:false});
  for (const status of ["draft","recalled"]) assert.deepEqual(documentActions({...document,status}, true), {canDecide:false,canRecall:false,canEdit:true,canDelete:false});
  assert.deepEqual(documentActions(null, true), {canDecide:false,canRecall:false,canEdit:false,canDelete:false});
});


test("draft delete actions require an explicit server grant and a current version; recall never grants deletion", () => {
  const document = {status:"draft",canDelete:true,canEdit:true,updatedAt:"2026-10-05T00:12:00.000Z"};
  assert.equal(documentActions(document, false).canDelete, true);
  assert.equal(documentActions({...document,canDelete:undefined}, true).canDelete, false);
  assert.equal(documentActions({...document,updatedAt:null}, true).canDelete, false);
  for (const status of ["recalled","submitted","in_progress","approved","rejected","discarded"]) {
    assert.equal(documentActions({...document,status}, true).canDelete, false);
  }
});
