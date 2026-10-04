import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DriverAdapterError } from '@prisma/driver-adapter-utils';
import { createDraftServerHarness } from './helpers/mobile-draft-recovery-server.mjs';

const input = (requestId = 'request_recovery_01') => ({ requestId, intent: 'draft', title: 'Synthetic draft', templateId: 'template-a', fieldValues: { note: 'Synthetic note' }, approverIds: [], uploadIds: [] });
const privateHeaders = (response: Response) => {
  assert.match(response.headers.get('cache-control') ?? '', /private/);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('vary'), 'Authorization, Cookie');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
};
const request = (body: string | Uint8Array, headers: Record<string, string> = {}) => new Request('https://fixture.invalid/api/mobile/drafts', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

test('draft options and own reads use the supplied transaction snapshot without policy initialization, storage or private profile data', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts'); x.h.forbidGlobal = true;
  const options = await m.getMobileDraftOptions('actor-a', x.dependencies);
  assert.equal(options.templates[0].fields[0].name, 'note'); assert.equal(options.approvers[0].id, 'director');
  assert.equal(x.h.writes.length, 0); assert.equal(x.h.attachmentPolicy.length, 0); assert.equal(x.h.globalDb, 0);
  const saved = await m.saveMobileDraft('actor-a', input(), null, x.dependencies);
  x.h.writes.length = 0; x.h.cache.length = 0;
  assert.equal((await m.getMobileDraftList('actor-a', x.dependencies)).total, 1);
  assert.equal((await m.getMobileDraftList('actor-b', x.dependencies)).total, 0);
  await assert.rejects(m.getMobileDraft('actor-b', saved.documentId, x.dependencies), { status: 404 });
  const own = await m.getMobileDraft('actor-a', saved.documentId, x.dependencies);
  assert.equal(own.draft.fieldValues.note, 'Synthetic note');
  assert.ok(!JSON.stringify({ options, own }).includes('PRIVATE_EMAIL'));
  assert.equal(x.h.writes.length, 0); assert.equal(x.h.storage.length, 0); assert.equal(x.h.cache.length, 0); assert.equal(x.h.globalDb, 0);
  assert.ok(x.h.transactions.some(v => v.isolationLevel === 'RepeatableRead'));
});

test('same normalized request replays one document and audit, while changed payload cannot reuse its key', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts');
  const saved = await m.saveMobileDraft('actor-a', input(), null, x.dependencies);
  const replay = await m.saveMobileDraft('actor-a', { ...input(), title: '  Synthetic draft  ', fieldValues: { note: ' Synthetic note ' } }, null, x.dependencies);
  assert.deepEqual(replay, saved); assert.equal(x.h.approvalDocument.length, 1); assert.equal(x.h.auditLog.length, 1);
  await assert.rejects(m.saveMobileDraft('actor-a', { ...input(), title: 'Different' }, null, x.dependencies), { status: 409, code: 'REQUEST_CONFLICT' });
  assert.equal(x.h.approvalDocument.length, 1); assert.equal(x.h.auditLog.length, 1);
});

test('receipt status preserves original commitment separately from newer current data, is actor-owned and never exposes content', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts');
  const saved = await m.saveMobileDraft('actor-a', input(), null, x.dependencies);
  x.h.approvalDocument[0].updatedAt = new Date('2026-10-04T05:00:00.000Z'); x.h.approvalDocument[0].status = 'SUBMITTED';
  x.h.writes.length = 0; x.h.cache.length = 0;
  const status = await m.getMobileDraftRequestStatus('actor-a', input().requestId, null, x.dependencies);
  assert.deepEqual(status.current, { status: 'submitted', updatedAt: '2026-10-04T05:00:00.000Z', editable: false });
  assert.equal(status.committedUpdatedAt, saved.proof.committedUpdatedAt);
  assert.deepEqual(Object.keys(status).sort(), ['ok', 'requestId', 'intent', 'originalDocumentId', 'documentId', 'committedAt', 'committedUpdatedAt', 'outcome', 'current'].sort());
  assert.ok(!JSON.stringify(status).includes('Synthetic note')); assert.ok(!JSON.stringify(status).includes('NO_METADATA_IN_DTO'));
  await assert.rejects(m.getMobileDraftRequestStatus('actor-b', input().requestId, null, x.dependencies), { status: 404 });
  await assert.rejects(m.getMobileDraftRequestStatus('actor-a', input().requestId, 'wrong-document', x.dependencies), { status: 409, code: 'REQUEST_SCOPE_CONFLICT' });
  assert.equal(x.h.writes.length, 0); assert.equal(x.h.cache.length, 0); assert.equal(x.h.storage.length, 0);
});

test('fresh inactive identity stops replay and status before audit or document access', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts');
  await m.saveMobileDraft('actor-a', input(), null, x.dependencies); x.h.user[0].status = 'INACTIVE';
  for (const action of [() => m.saveMobileDraft('actor-a', input(), null, x.dependencies), () => m.getMobileDraftRequestStatus('actor-a', input().requestId, null, x.dependencies)]) {
    x.h.reads.length = 0; x.h.writes.length = 0;
    await assert.rejects(action(), { status: 401 });
    assert.deepEqual(x.h.reads.map(v => v.model), ['user']); assert.equal(x.h.writes.length, 0);
  }
});

test('deleted and legacy commitments retain evidence without recreating or inventing a complete proof', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts');
  const saved = await m.saveMobileDraft('actor-a', input(), null, x.dependencies);
  const fullMetadata = structuredClone(x.h.auditLog[0].metadata);
  x.h.auditLog[0].metadata = { mobileRequestId: input().requestId, mobilePayloadHash: fullMetadata.mobilePayloadHash, source: 'mobile' };
  assert.deepEqual(await m.saveMobileDraft('actor-a', input(), null, x.dependencies), { documentId: saved.documentId, status: saved.status, updatedAt: saved.updatedAt });
  await assert.rejects(m.getMobileDraftRequestStatus('actor-a', input().requestId, null, x.dependencies), { status: 409, code: 'REQUEST_PROOF_UNAVAILABLE' });
  x.h.auditLog[0].metadata = fullMetadata; x.h.auditLog[0].documentId = null; x.h.approvalDocument.length = 0;
  const deleted = await m.getMobileDraftRequestStatus('actor-a', input().requestId, null, x.dependencies);
  assert.equal(deleted.outcome, 'deleted'); assert.equal(deleted.current, null); assert.equal(deleted.documentId, saved.documentId);
  await assert.rejects(m.saveMobileDraft('actor-a', input(), null, x.dependencies), { status: 410, code: 'REQUEST_ALREADY_DELETED' });
  assert.equal(x.h.approvalDocument.length, 0); assert.equal(x.h.auditLog.length, 1);
});

test('CAS advances a future baseline by one millisecond and binds only the newly-created same-time audit', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts');
  const first = await m.saveMobileDraft('actor-a', input(), null, x.dependencies);
  const future = new Date('2026-10-05T00:00:00.000Z'); x.h.approvalDocument[0].updatedAt = future;
  x.h.auditLog.push({ ...structuredClone(x.h.auditLog[0]), id: 'same-time-old', action: 'UPDATE_DRAFT', metadata: { oldMarker: true } });
  const body = { ...input('request_recovery_02'), expectedUpdatedAt: future.toISOString(), title: 'Updated' };
  const next = await m.saveMobileDraft('actor-a', body, first.documentId, x.dependencies);
  assert.equal(next.updatedAt, '2026-10-05T00:00:00.001Z'); assert.equal(next.proof.originalDocumentId, first.documentId);
  assert.deepEqual(x.h.auditLog.find(v => v.id === 'same-time-old').metadata, { oldMarker: true });
  assert.equal(x.h.auditLog.filter(v => v.metadata.mobileRequestId === body.requestId).length, 1);
  const writes = x.h.writes.length;
  await assert.rejects(m.saveMobileDraft('actor-a', { ...body, requestId: 'request_recovery_03' }, first.documentId, x.dependencies), { status: 409 });
  assert.equal(x.h.writes.length, writes); assert.equal(x.h.approvalDocument[0].title, 'Updated');
});

test('audit binding failure rolls back business effects and upload linking; post-commit cache and PDF failures preserve proof', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts');
  x.h.mobileDraftUpload.push({ id: 'upload-a', userId: 'actor-a', documentId: null, originalName: 'Synthetic.pdf', mimeType: 'application/pdf', size: 10, completedAt: x.h.now, expiresAt: new Date(+x.h.now + 10000), storageProvider: 'local', storageKey: 'synthetic-only' });
  x.h.auditFailure = true;
  await assert.rejects(m.saveMobileDraft('actor-a', { ...input(), uploadIds: ['upload-a'] }, null, x.dependencies), /Synthetic binding failure/);
  assert.equal(x.h.approvalDocument.length, 0); assert.equal(x.h.auditLog.length, 0); assert.equal(x.h.mobileDraftUpload[0].documentId, null); assert.equal(x.h.cache.length, 0);
  x.h.auditFailure = false;
  const result = await m.saveMobileDraft('actor-a', { ...input(), intent: 'submit', approverIds: ['director'] }, null, { ...x.dependencies, cache: () => { throw Error('PRIVATE_CACHE_FAILURE'); }, generatePdf: () => { throw Error('PRIVATE_PDF_FAILURE'); } });
  assert.ok(result.proof); assert.equal(result.status, 'submitted'); assert.equal(x.h.approvalDocument.length, 1);
  assert.ok(!JSON.stringify(x.h.errors).includes('PRIVATE_')); assert.equal(x.h.storage.length, 0);
});

test('HTTP authentication precedes body and params, and private headers apply to every successful and failed status', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts'); x.h.session = null;
  let bodyReads = 0, paramReads = 0;
  const post = x.load('app/api/mobile/drafts/route.ts');
  const unsigned = new Request('https://fixture.invalid/api/mobile/drafts', { method: 'POST' });
  Object.defineProperty(unsigned, 'body', { get() { bodyReads++; throw Error('Unauthorized body read'); } });
  const response = await post.POST(unsigned); assert.equal(response.status, 401); privateHeaders(response);
  const statusRoute = x.load('app/api/mobile/drafts/requests/[requestId]/route.ts');
  const context = { get params() { paramReads++; throw Error('Unauthorized params read'); } };
  const status = await statusRoute.GET(new Request('https://fixture.invalid/api/mobile/drafts/requests/bad?unknown=x'), context);
  assert.equal(status.status, 401); privateHeaders(status); assert.equal(bodyReads + paramReads, 0); assert.equal(x.h.transactions.length, 0); assert.equal(x.h.globalDb, 0);
  x.h.session = 'actor-a';
  const core = x.load('lib/mobile-draft-core.ts');
  for (const code of [400, 404, 409, 410, 413, 415, 408]) {
    const failed = await m.mobileDraftRoute(new Request('https://fixture.invalid'), async () => { throw new core.MobileDraftError('Synthetic rejection', code); });
    assert.equal(failed.status, code); privateHeaders(failed);
  }
  const failed = await m.mobileDraftRoute(new Request('https://fixture.invalid'), async () => { throw Error('PRIVATE_STORAGE_ERROR'); });
  assert.equal(failed.status, 500); privateHeaders(failed); assert.ok(!(await failed.text()).includes('PRIVATE_STORAGE_ERROR'));
});

test('actual request-status HTTP route rejects ambiguous scope and returns only the actor-owned proof', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts'); await m.saveMobileDraft('actor-a', input(), null, x.dependencies);
  const route = x.load('app/api/mobile/drafts/requests/[requestId]/route.ts'), context = { params: Promise.resolve({ requestId: input().requestId }) };
  for (const query of ['?documentId=one&documentId=two', '?token=hidden', '?documentId=', '?documentId=../bad']) {
    const bad = await route.GET(new Request('https://fixture.invalid/api/mobile/drafts/requests/' + input().requestId + query), context);
    assert.equal(bad.status, 400); privateHeaders(bad);
  }
  const ok = await route.GET(new Request('https://fixture.invalid/api/mobile/drafts/requests/' + input().requestId), context);
  assert.equal(ok.status, 200); privateHeaders(ok); assert.equal((await ok.json()).documentId, x.h.approvalDocument[0].id);
  x.h.session = 'actor-b';
  const absent = await route.GET(new Request('https://fixture.invalid/api/mobile/drafts/requests/' + input().requestId), context);
  assert.equal(absent.status, 404); privateHeaders(absent);
});

test('actual bounded JSON parser rejects decoded duplicate keys, invalid UTF8, mismatched lengths and over-limit bodies', async () => {
  const x = createDraftServerHarness(), { readMobileDraftJson } = x.load('lib/mobile-draft-json.ts');
  assert.deepEqual(await readMobileDraftJson(request('{"safe":{"one":1},"list":[{"one":2}]}')), { safe: { one: 1 }, list: [{ one: 2 }] });
  for (const value of ['{"requestId":"one","request\\u0049d":"two"}', '{"nested":{"x":1,"x":2}}']) await assert.rejects(readMobileDraftJson(request(value)), { status: 400 });
  await assert.rejects(readMobileDraftJson(request(new Uint8Array([0xc3, 0x28]))), { status: 400 });
  await assert.rejects(readMobileDraftJson(request('{}', { 'content-length': '3' })), { status: 400 });
  await assert.rejects(readMobileDraftJson(request('{}', { 'content-type': 'text/plain' })), { status: 415 });
  await assert.rejects(readMobileDraftJson(request('{}', { 'content-length': '1200001' })), { status: 413 });
  await assert.rejects(readMobileDraftJson(request(' '.repeat(1200001))), { status: 413 });
  assert.equal(x.h.timers.size, 0); assert.equal(x.h.transactions.length, 0);
});

test('JSON deadlines cover ready chunk and EOF acknowledgement as well as stalled readers without changing global clock', async () => {
  for (const eof of [false, true]) {
    const x = createDraftServerHarness(), { readMobileDraftJson } = x.load('lib/mobile-draft-json.ts'); x.h.clock = 0;
    let cancelled = 0, released = 0, count = 0;
    const body = { getReader: () => ({ read: async () => { count++; if (!eof || count === 2) { x.h.clock = 10000; return { done: eof, value: new TextEncoder().encode('{}') }; } return { done: false, value: new TextEncoder().encode('{}') }; }, cancel: async () => { cancelled++; }, releaseLock: () => { released++; } }) };
    const req = { headers: new Headers({ 'content-type': 'application/json' }), body };
    await assert.rejects(readMobileDraftJson(req), { status: 408 }); assert.equal(cancelled, 1); assert.equal(released, 1); assert.equal(x.h.timers.size, 0);
  }
  const x = createDraftServerHarness(), { readMobileDraftJson } = x.load('lib/mobile-draft-json.ts'); x.h.clock = 0;
  let cancelled = 0, released = 0;
  const req = { headers: new Headers({ 'content-type': 'application/json' }), body: { getReader: () => ({ read: () => new Promise(() => undefined), cancel: async () => { cancelled++; }, releaseLock: () => { released++; } }) } };
  const result = readMobileDraftJson(req); await Promise.resolve(); x.fireTimers();
  await assert.rejects(result, { status: 408 }); assert.equal(cancelled, 1); assert.equal(released, 1); assert.equal(x.h.timers.size, 0);
});


test('real adapter commit conflicts retry at most three transactions without duplicate effects; constraints and untyped lookalikes never retry', async () => {
  const x = createDraftServerHarness(), m = x.load('lib/mobile-drafts.ts');
  x.h.commitErrors.push(new DriverAdapterError({ kind: 'TransactionWriteConflict' }), new Error('wrapped', { cause: new DriverAdapterError({ kind: 'TransactionWriteConflict' }) }));
  const result = await m.saveMobileDraft('actor-a', input(), null, x.dependencies);
  assert.ok(result.proof); assert.equal(x.h.transactions.length, 3); assert.equal(x.h.approvalDocument.length, 1); assert.equal(x.h.auditLog.length, 1);
  assert.equal(x.h.reads.filter(v => v.model === 'user' && v.where?.id === 'actor-a').length, 3);
  const all = createDraftServerHarness(), domain = all.load('lib/mobile-drafts.ts');
  all.h.commitErrors.push(...Array.from({ length: 4 }, () => new DriverAdapterError({ kind: 'TransactionWriteConflict' })));
  await assert.rejects(domain.saveMobileDraft('actor-a', input(), null, all.dependencies));
  assert.equal(all.h.transactions.length, 3); assert.equal(all.h.approvalDocument.length + all.h.auditLog.length, 0);
  for (const cause of [new DriverAdapterError({ kind: 'postgres', code: '23514', severity: 'ERROR', message: 'Synthetic check', detail: undefined, column: undefined, hint: undefined }), Object.assign(new Error('lookalike'), { code: 'P2034' })]) {
    const isolated = createDraftServerHarness(); isolated.h.commitErrors.push(cause);
    await assert.rejects(isolated.load('lib/mobile-drafts.ts').saveMobileDraft('actor-a', input(), null, isolated.dependencies));
    assert.equal(isolated.h.transactions.length, 1); assert.equal(isolated.h.approvalDocument.length + isolated.h.auditLog.length, 0);
  }
});
