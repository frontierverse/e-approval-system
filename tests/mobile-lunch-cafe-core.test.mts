import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../mobile/src/lib/api';
import { cafeDirty, cafeHoldAllowed, cafeInput, cafePage, cafeScalar, cafeUnknown, cafeValues, defaultCafeFilters, defaultCafeHistory, isCafeDetail, isCafeHistory, isCafeItemPage, isCafeMutation, isCafeNotes, isMealDate, isMealMenu, shiftMealDate, validateCafeHold, validateCafeNote, validateCafeValues } from '../mobile/src/lib/lunch-cafe';
const iso = '2026-10-04T00:00:00.000Z';
const newer = '2026-10-04T00:00:00.001Z';
const item = { id: 'item1', name: '합성 커피', category: 'food', purchasedAt: '2026-10-01', priceWon: 0, expirationDate: '2026-10-03', isHeld: false, usage: { basisLabel: '유통기한 기준', label: 'D+1', status: 'expired' } };
const detail = { today: '2026-10-04', item: { ...item, purchaseReason: null, expirationHoldReason: null, createdAt: iso, updatedAt: iso } };
const note = { id: 'note1', content: '합성 준수사항', createdAt: iso, updatedAt: iso, createdBy: null };
const page = { today: detail.today, filters: defaultCafeFilters, summary: { expiredFoodCount: 8, dueSoonFoodCount: 12, heldItemCount: 3 }, items: [item], page: 1, pageSize: 20, total: 1, totalPages: 1 };
const baseProof = { ok: true, message: '완료', replayed: true, requestId: 'original', operation: 'item.create', targetType: 'CafeItem', targetId: 'item1', outcome: 'present', committedAt: iso, committedUpdatedAt: iso, result: detail };

test('meal dates accept the entire Gregorian range and never silently canonicalize malformed route params', () => {
  for (const value of ['0001-01-01', '0099-02-28', '0100-03-01', '2000-02-29', '9999-12-31']) assert.ok(isMealDate(value));
  for (const value of ['0000-01-01', '1900-02-29', '2026-2-01', ' 2026-10-04', '10000-01-01']) assert.equal(isMealDate(value), false);
  assert.equal(shiftMealDate('0001-01-01', -1), null);
  assert.equal(shiftMealDate('9999-12-31', 1), null);
  assert.equal(shiftMealDate('0099-12-31', 1), '0100-01-01');
  assert.equal(cafeScalar(['2026-10-04']), '');
  assert.equal(cafeScalar(undefined), undefined);
  for (const value of ['0', '01', ' 1', '1.0', '1000000000', ['1']]) assert.equal(cafePage(value), null);
  assert.equal(cafePage('999999999'), 999999999);
});

test('meal menu verifies selected date, school totals, and allows real duplicate menu text without private fields', () => {
  const menu = { today: '2026-10-04', date: '0001-01-01', menuItems: ['국', '국'], summary: { schoolCount: 1, totalCount: 5, preservationCount: 1, deliveryDriverCount: 1 }, schools: [{ schoolId: 'school', schoolName: '합성학교', schoolType: 'elementary', totalCount: 5, preservationCount: 1, deliveryDriverCount: 1 }] };
  assert.ok(isMealMenu(menu, '0001-01-01'));
  assert.equal(isMealMenu(menu), false);
  assert.equal(isMealMenu({ ...menu, summary: { ...menu.summary, totalCount: 4 } }, menu.date), false);
  assert.equal(isMealMenu({ ...menu, schools: [{ ...menu.schools[0], checkedBy: 'private' }] }, menu.date), false);
  assert.equal(isMealMenu({ ...menu, schools: [menu.schools[0], menu.schools[0]], summary: { schoolCount: 2, totalCount: 10, preservationCount: 2, deliveryDriverCount: 2 } }, menu.date), false);
  assert.ok(isMealMenu({ today: menu.today, date: menu.today, menuItems: [], summary: { schoolCount: 0, totalCount: 0, preservationCount: 0, deliveryDriverCount: 0 }, schools: [] }));
});

test('filtered cafe count is independent of overall summary, while scope and pagination stay strict', () => {
  assert.ok(isCafeItemPage(page));
  assert.equal(isCafeItemPage({ ...page, filters: { ...page.filters, query: 'foreign' } }), false);
  assert.equal(isCafeItemPage({ ...page, items: [item, item], total: 2 }), false);
  assert.equal(isCafeItemPage({ ...page, pageSize: 7 }), false);
  assert.equal(isCafeItemPage({ ...page, total: 21, totalPages: 2 }), false);
  assert.ok(isCafeItemPage({ ...page, items: [], total: 0 }));
  assert.equal(isCafeItemPage({ ...page, items: [{ ...item, purchaseReason: 'private' }] }), false);
});

test('detail retains zero price versus null and rejects held flag mismatch or private metadata', () => {
  assert.ok(isCafeDetail(detail, 'item1'));
  assert.equal(isCafeDetail(detail, 'other'), false);
  assert.ok(isCafeDetail({ ...detail, item: { ...detail.item, priceWon: null, isHeld: true, expirationHoldReason: '' } }));
  assert.equal(isCafeDetail({ ...detail, item: { ...detail.item, isHeld: true } }), false);
  assert.equal(isCafeDetail({ ...detail, item: { ...detail.item, email: 'private' } }), false);
  assert.ok(cafeHoldAllowed(detail));
  assert.equal(cafeHoldAllowed({ ...detail, item: { ...detail.item, expirationDate: detail.today } }), false);
});

test('notes require CAS timestamps and tolerate deleted author without owner-only policy', () => {
  assert.ok(isCafeNotes({ notes: [note], page: 1, pageSize: 20, total: 1, totalPages: 1 }));
  const withoutToken: Partial<typeof note> = { ...note };
  delete withoutToken.updatedAt;
  assert.equal(isCafeNotes({ notes: [withoutToken], page: 1, pageSize: 20, total: 1, totalPages: 1 }), false);
  assert.equal(isCafeNotes({ notes: [{ ...note, createdBy: { id: 'actor', name: '합성직원', email: 'private' } }], page: 1, pageSize: 20, total: 1, totalPages: 1 }), false);
});

test('deleted target history is valid and permits only safe actor/message projection', () => {
  const filters = { ...defaultCafeHistory, itemId: 'deleted' };
  const log = { id: 'log1', actionType: 'delete', actor: { id: 'actor', name: '직원' }, createdAt: iso, itemId: 'deleted', itemName: '이전 물품', message: '물품 삭제' };
  const response = { filters, actors: [log.actor], logs: [log], page: 1, pageSize: 20, total: 1, totalPages: 1 };
  assert.ok(isCafeHistory(response, filters));
  assert.equal(isCafeHistory({ ...response, logs: [{ ...log, metadata: {} }] }, filters), false);
  assert.equal(isCafeHistory({ ...response, logs: [{ ...log, itemId: 'foreign' }] }, filters), false);
});

test('immutable receipt proof binds actor request/operation/target and keeps original token distinct from current row', () => {
  const expected = { requestId: 'original', operation: 'item.create' as const };
  assert.ok(isCafeMutation(baseProof, expected));
  assert.ok(isCafeMutation({ ...baseProof, result: { ...detail, item: { ...detail.item, updatedAt: newer, name: '다른 직원의 변경' } } }, expected));
  assert.ok(isCafeMutation({ ...baseProof, outcome: 'deleted', result: null }, expected));
  for (const override of [{ requestId: 'foreign' }, { targetType: 'Youth' }, { committedUpdatedAt: null }, { committedAt: 'invalid' }]) assert.equal(isCafeMutation({ ...baseProof, ...override }, expected), false);
  assert.equal(isCafeMutation(baseProof, { ...expected, targetId: 'foreign' }), false);
  const deletion = { ...baseProof, operation: 'item.delete', outcome: 'deleted', result: null, committedUpdatedAt: null };
  assert.ok(isCafeMutation(deletion, { requestId: 'original', operation: 'item.delete', targetId: 'item1' }));
  assert.equal(isCafeMutation({ ...deletion, outcome: 'present', result: detail }, { requestId: 'original', operation: 'item.delete' }), false);
  assert.equal(isCafeMutation({ ...deletion, committedUpdatedAt: iso }, { requestId: 'original', operation: 'item.delete' }), false);
  assert.ok(isCafeMutation({ ...baseProof, operation: 'note.create', targetType: 'CafeComplianceNote', targetId: note.id, result: note }, { requestId: 'original', operation: 'note.create' }));
});

test('form normalization matches existing limits and strips non-food expiration without erasing reasons', () => {
  const values = cafeValues(detail.item);
  assert.deepEqual(validateCafeValues(values), {});
  assert.equal(cafeDirty(values, detail.item, detail.today), false);
  assert.equal(cafeInput({ ...values, priceWon: '' }).priceWon, null);
  assert.equal(cafeInput({ ...values, category: 'equipment', expirationDate: '2026-10-04' }).expirationDate, null);
  assert.ok(validateCafeValues({ ...values, priceWon: '-1' }).priceWon);
  assert.ok(validateCafeValues({ ...values, priceWon: '1000000000' }).priceWon);
  assert.ok(validateCafeValues({ ...values, expirationDate: '' }).expirationDate);
  assert.ok(validateCafeValues({ ...values, name: '한'.repeat(101) }).name);
  assert.equal(validateCafeNote('한'.repeat(2000)), null);
  assert.ok(validateCafeNote('한'.repeat(2001)));
  assert.equal(validateCafeHold('한'.repeat(500)), null);
  assert.ok(validateCafeHold('  '));
});

test('all successful malformed bodies and ambiguous transport failures require own receipt recovery', () => {
  for (const status of [0, 200, 201, 202, 204, 408, 500, 503]) assert.ok(cafeUnknown(new ApiError('합성', status)));
  for (const status of [400, 401, 403, 404, 409, 413, 415]) assert.equal(cafeUnknown(new ApiError('합성', status)), false);
});
