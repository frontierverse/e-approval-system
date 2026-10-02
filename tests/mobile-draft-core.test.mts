import assert from "node:assert/strict";
import { test } from "node:test";
import { mobileDraftDigest, parseMobileDraft, parseMobileUpload } from "../src/lib/mobile-draft-core";
import { compileDocumentTemplateContentFromSchema, getMeetingAgendaItems, validateDocumentTemplateContentValues } from "../src/lib/draft-template-content";
import { getMeetingMinutesDocumentTemplateSchema } from "../src/lib/document-template-schema";
import { readMeetingItems, writeMeetingItems } from "../mobile/src/lib/meeting-items";
const payload = { requestId: "mobile_request_123456", title: "  기안 제목  ", templateId: "template-general", fieldValues: { content: "  테스트 내용입니다.  " }, approverIds: ["approver"], uploadIds: [], intent: "draft", expectedUpdatedAt: null };
test("mobile draft rejects duplicate, self supplied storage paths and oversized input", () => {
  assert.equal(parseMobileDraft(payload).title, "기안 제목");
  for (const patch of [{ requestId: "../invalid" }, { approverIds: ["a", "a"] }, { uploadIds: ["a", "a"] }, { uploadIds: ["attachments/private.pdf"] }, { title: "가".repeat(121) }, { fieldValues: { constructor: "bad" } }, { fieldValues: { content: "가".repeat(5001) } }, { intent: "approve" }]) assert.throws(() => parseMobileDraft({ ...payload, ...patch }));
});
test("retry digest ignores request identifier and field key order but tracks intent, timestamp and document", () => {
  const a = parseMobileDraft({ ...payload, fieldValues: { purpose: "a", content: "b" } });
  const b = parseMobileDraft({ ...payload, requestId: "different_request_12345", fieldValues: { content: "b", purpose: "a" } });
  assert.equal(mobileDraftDigest(a, null), mobileDraftDigest(b, null));
  for (const changed of [{ ...a, intent: "submit" as const }, { ...a, title: "다른 제목" }, { ...a, expectedUpdatedAt: "2026-10-02T00:00:00Z" }]) assert.notEqual(mobileDraftDigest(a, "doc"), mobileDraftDigest(changed, "doc"));
  assert.notEqual(mobileDraftDigest(a, null), mobileDraftDigest(a, "doc"));
});
test("upload policy checks extension, traversal, byte limit and unsafe MIME headers", () => {
  const policy = { allowedExtensions: [".pdf"], maxFileSizeMb: 1 };
  assert.equal(parseMobileUpload({ name: "자료.PDF", size: 1024, mimeType: "application/pdf" }, policy).originalName, "자료.PDF");
  for (const patch of [{ name: "../자료.pdf" }, { name: "자료.exe" }, { size: 0 }, { size: 1024 * 1024 + 1 }, { size: 0.5 }, { mimeType: "application/pdf\r\nX: bad" }]) assert.throws(() => parseMobileUpload({ name: "자료.pdf", size: 1024, ...patch }, policy));
});
test("native meeting entries preserve the web's structured content format", () => {
  const items = [{ title: "운영 계획", content: "첫째 논의\n둘째 논의" }, { title: "안전 점검", content: "시설 점검 내용을 기록합니다." }];
  const fields = writeMeetingItems(items);
  assert.deepEqual(getMeetingAgendaItems(fields), items);
  assert.deepEqual(readMeetingItems(fields), items);
  const schema = getMeetingMinutesDocumentTemplateSchema();
  const values = { meetingDate: "2026-10-02", meetingPlace: "회의실", attendees: "검증 직원", ...fields };
  assert.ok(compileDocumentTemplateContentFromSchema(schema, values).includes("안건 2. 안전 점검"));
  assert.ok(validateDocumentTemplateContentValues(schema, { ...values, discussion: "" }).some(error => error.includes("내용") || error.includes("논의")));
});
