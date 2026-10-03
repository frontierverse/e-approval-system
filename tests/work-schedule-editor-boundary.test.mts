import assert from 'node:assert/strict';
import { test } from 'node:test';
import {harness,row,stamp,settle,text,walk} from './helpers/work-schedule-editor-boundary.mjs';

test('web captures ID and token at open; refreshed records cannot silently change the write baseline or user input', async () => {
  const h = harness(); h.open(); await settle();
  h.field('업무 내용').props.onChange({ currentTarget: { value: '보관한 입력' } }); await settle();
  h.updateRows([row({ updatedAt: '2026-10-03T00:00:00.001Z', content: '다른 직원 변경' })]); await settle();
  assert.equal(h.field('업무 내용').props.value, '보관한 입력');
  const save = h.button('저장').props.onClick; save(); save();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].args.slice(4), ['2026-10-03', 540, { manualScheduleId: 'qa-manual-old', expectedUpdatedAt: stamp }]);
  h.modal().props.onClose(); assert(h.hasModal());
  h.calls[0].resolve({ ok: false, error: '동시 변경 충돌' }); await settle();
  assert.equal(h.field('업무 내용').props.value, '보관한 입력'); assert(h.focuses > 0); assert.equal(h.calls.length, 1); h.destroy();
});
test('web explicit delete confirms the captured record and cannot remove a replacement ID from the refreshed list', async () => {
  const h = harness(); h.open(); await settle(); h.answers.push(false);
  h.button('삭제').props.onClick(); assert.equal(h.calls.length, 0); assert(h.confirms[0].includes('공용 원본')); assert(h.confirms[0].includes('복구할 수 없습니다'));
  const remove = h.button('삭제').props.onClick; remove(); remove(); assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].args, ['2026-10-03', 540, { manualScheduleId: 'qa-manual-old', expectedUpdatedAt: stamp }]);
  h.updateRows([row({ id: 'qa-new-at-same-slot', content: '새 기록 보존' })]); await settle();
  h.calls[0].resolve({ ok: true, data: { scheduleDate: '2026-10-03', startMinute: 540 } }); await settle();
  assert(!h.hasModal()); assert(text(h.tree).includes('새 기록 보존')); h.destroy();
});
test('web blank-save deletion requires confirmation and retains the legacy deletion baseline', async () => {
  const h = harness(); h.open(); await settle(); h.field('업무 내용').props.onChange({ currentTarget: { value: '   ' } }); await settle();
  h.answers.push(false); h.button('저장').props.onClick(); assert.equal(h.calls.length, 0); assert.equal(h.field('업무 내용').props.value, '   ');
  h.button('저장').props.onClick(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].args[6].manualScheduleId, 'qa-manual-old');
  h.calls[0].resolve({ ok: true, data: { schedule: null } }); await settle(); assert(!h.hasModal()); h.destroy();
});
test('web create uses an explicit null baseline; unknown response preserves input without any automatic mutation', async () => {
  const h = harness(); h.openNew(); await settle(); h.field('업무 내용').props.onChange({ currentTarget: { value: '신규 보관' } }); await settle();
  h.button('저장').props.onClick(); assert.deepEqual(h.calls[0].args[6], { manualScheduleId: null, expectedUpdatedAt: '' });
  h.calls[0].reject(new Error('response lost')); await settle(); assert.equal(h.field('업무 내용').props.value, '신규 보관'); assert.equal(h.calls.length, 1); assert(h.focuses > 0); h.destroy();
});
test('web missing manual token blocks both write actions and preserves the edit contents', async () => {
  const h = harness([row({ updatedAt: undefined })]); h.open(); await settle(); h.button('저장').props.onClick(); h.button('삭제').props.onClick(); await settle();
  assert.equal(h.calls.length, 0); assert.equal(h.field('업무 내용').props.value, '공용 원본'); assert(h.focuses > 0); h.destroy();
});
test('web dirty close is explicit and a read-only snapshot cannot become editable on prop refresh', async () => {
  const h = harness(); h.open(); await settle(); h.field('업무 내용').props.onChange({ currentTarget: { value: '닫기 전 입력' } }); await settle();
  h.answers.push(false); h.modal().props.onClose(); assert(h.hasModal()); h.answers.push(true); h.modal().props.onClose(); await settle(); assert(!h.hasModal()); h.destroy();
  const r = harness([row({ readOnly: true, sourceType: 'approvedVacation' })]); r.open(); await settle(); r.updateRows([row()]); await settle();
  let readonlyViews = 0, editableFields = 0; walk(r.modal(), node => { if (typeof node.type === 'function' && node.type.name === 'WorkScheduleReadOnlyDetail') readonlyViews++; if (node.type === 'textarea' || node.type === 'select' || node.type === 'DatePickerInput') editableFields++; }); assert.equal(readonlyViews, 0); assert.equal(editableFields, 0); assert.equal(r.calls.length, 0); r.destroy();
});
test('web late action completion cannot update an unmounted editor', async () => {
  const h = harness(); h.open(); await settle(); h.button('저장').props.onClick(); h.destroy(); h.calls[0].resolve({ ok: true, data: { schedule: row({ content: '늦은 응답' }) } }); await settle(); assert.equal(h.field('업무 내용').props.value, '공용 원본');
});


test('web a late save acknowledgement cannot replace a newer props row with the same ID', async () => {
  const h = harness(); h.open(); await settle();
  h.field('업무 내용').props.onChange({ currentTarget: { value: '이전 저장 응답' } }); await settle();
  h.button('저장').props.onClick();
  h.updateRows([row({ content: '더 최신 직원 변경', updatedAt: '2026-10-03T00:00:00.003Z' })]); await settle();
  h.calls[0].resolve({ ok: true, data: { schedule: row({ content: '이전 저장 응답', updatedAt: '2026-10-03T00:00:00.001Z' }) } }); await settle();
  assert(!h.hasModal()); assert(text(h.tree).includes('더 최신 직원 변경')); assert(!text(h.tree).includes('이전 저장 응답')); assert.equal(h.calls.length, 1); h.destroy();
});
test('web refreshed replacement at the same slot survives without resurrecting the acknowledged old source ID', async () => {
  const h = harness(); h.open(); await settle();
  h.field('업무 내용').props.onChange({ currentTarget: { value: '이전 ID 저장 응답' } }); await settle();
  h.button('저장').props.onClick();
  h.updateRows([row({ id: 'qa-replacement-new', content: '같은 시간 새 ID 일정', updatedAt: '2026-10-03T00:00:00.003Z' })]); await settle();
  h.calls[0].resolve({ ok: true, data: { schedule: row({ content: '이전 ID 저장 응답', updatedAt: '2026-10-03T00:00:00.001Z' }) } }); await settle();
  assert(!h.hasModal()); assert(text(h.tree).includes('같은 시간 새 ID 일정')); assert(!text(h.tree).includes('이전 ID 저장 응답')); assert.equal(h.calls.length, 1); h.destroy();
});


test('web a hospital appointment removed from fresh props renders no private snapshot or editable controls', async () => {
  const h = harness([row({ readOnly: true, sourceType: 'hospitalAppointment', content: '학생 예약 비공개', detailLabel: '병원 비공개 · 인솔자 동행 비공개', timeLabel: '오전 9시 - 오전 10시' })]);
  h.open('학생 예약 비공개'); await settle();
  let firstViews = 0; walk(h.tree, node => { if (typeof node.type === 'function' && node.type.name === 'WorkScheduleReadOnlyDetail') firstViews++; }); assert.equal(firstViews, 1);
  h.updateRows([]); await settle();
  let privateViews = 0, editableFields = 0; walk(h.modal(), node => { if (typeof node.type === 'function' && node.type.name === 'WorkScheduleReadOnlyDetail') privateViews++; if (node.type === 'textarea' || node.type === 'select' || node.type === 'DatePickerInput') editableFields++; });
  assert(h.hasModal()); assert.equal(privateViews, 0); assert.equal(editableFields, 0); assert.equal(h.calls.length, 0);
  for (const value of ['학생 예약 비공개', '병원 비공개', '동행 비공개']) { assert(!text(h.tree).includes(value)); assert(!JSON.stringify(h.tree).includes(value)); }
  h.modal().props.onClose(); await settle(); assert(!h.hasModal()); h.destroy();
});


test('web an unknown new save locks captured and current submit callbacks while preserving input and allowing only a latest-list GET', async () => {
  const h = harness(); h.openNew(); await settle();
  h.field('업무 내용').props.onChange({ currentTarget: { value: '응답을 잃어도 보관할 새 입력' } }); await settle();
  const capturedSave = h.button('저장').props.onClick;
  capturedSave(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].kind, 'save');
  h.calls[0].reject(new Error('ack lost after create'));
  // The catch has run, but its scheduled render has not: an old enabled callback must already be locked.
  await Promise.resolve(); capturedSave(); capturedSave(); assert.equal(h.calls.length, 1);
  await settle();
  assert.equal(h.field('업무 내용').props.value, '응답을 잃어도 보관할 새 입력');
  assert.equal(h.button('결과 확인 필요').props.disabled, true);
  h.button('결과 확인 필요').props.onClick(); capturedSave(); assert.equal(h.calls.length, 1);
  h.button('최신 목록 확인').props.onClick(); assert.equal(h.refreshes, 1); assert.equal(h.calls.length, 1);
  // The created row might have moved before refresh. A fresh list must not silently authorize another POST.
  h.updateRows([row({ id: 'qa-created-moved', scheduleDate: '2026-10-04', content: '응답을 잃어도 보관할 새 입력' })]); await settle();
  assert.equal(h.field('업무 내용').props.value, '응답을 잃어도 보관할 새 입력');
  assert.equal(h.button('결과 확인 필요').props.disabled, true);
  h.button('결과 확인 필요').props.onClick(); capturedSave(); assert.equal(h.calls.length, 1);
  h.answers.push(false); h.modal().props.onClose(); await settle(); assert(h.hasModal()); h.destroy();
});

test('web an unknown existing save blocks captured and current save/delete callbacks even after newer props arrive', async () => {
  const h = harness(); h.open(); await settle();
  h.field('업무 내용').props.onChange({ currentTarget: { value: '기존 일정 보관 입력' } }); await settle();
  const capturedSave = h.button('저장').props.onClick, capturedDelete = h.button('삭제').props.onClick;
  capturedSave(); assert.equal(h.calls.length, 1);
  h.calls[0].reject(new Error('ack lost after update'));
  await Promise.resolve(); capturedSave(); capturedDelete(); assert.equal(h.calls.length, 1);
  await settle();
  assert.equal(h.field('업무 내용').props.value, '기존 일정 보관 입력');
  assert.equal(h.button('결과 확인 필요').props.disabled, true); assert.equal(h.button('삭제').props.disabled, true);
  h.button('결과 확인 필요').props.onClick(); h.button('삭제').props.onClick(); assert.equal(h.calls.length, 1);
  h.button('최신 목록 확인').props.onClick(); assert.equal(h.refreshes, 1);
  h.updateRows([row({ content: '서버 최신 입력', updatedAt: '2026-10-03T00:00:00.003Z' })]); await settle();
  assert.equal(h.field('업무 내용').props.value, '기존 일정 보관 입력');
  capturedSave(); capturedDelete(); h.button('결과 확인 필요').props.onClick(); h.button('삭제').props.onClick();
  assert.equal(h.calls.length, 1); assert.equal(h.confirms.length, 0); h.destroy();
});

test('web an unknown delete freezes both actions before rerender and retains inputs through latest-list GET', async () => {
  const h = harness(); h.open(); await settle();
  h.field('업무 내용').props.onChange({ currentTarget: { value: '삭제 결과 확인 중 보관할 입력' } }); await settle();
  const capturedSave = h.button('저장').props.onClick, capturedDelete = h.button('삭제').props.onClick;
  capturedDelete(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].kind, 'delete');
  h.calls[0].reject(new Error('ack lost after delete'));
  await Promise.resolve(); capturedDelete(); capturedSave(); assert.equal(h.calls.length, 1);
  await settle();
  assert.equal(h.field('업무 내용').props.value, '삭제 결과 확인 중 보관할 입력');
  assert.equal(h.button('삭제').props.disabled, true); assert.equal(h.button('결과 확인 필요').props.disabled, true);
  h.button('삭제').props.onClick(); h.button('결과 확인 필요').props.onClick(); assert.equal(h.calls.length, 1);
  h.button('최신 목록 확인').props.onClick(); assert.equal(h.refreshes, 1);
  h.updateRows([row({ id: 'qa-replacement-after-delete', content: '같은 시간 새 기록 보존' })]); await settle();
  assert.equal(h.field('업무 내용').props.value, '삭제 결과 확인 중 보관할 입력');
  capturedDelete(); capturedSave(); h.button('삭제').props.onClick(); h.button('결과 확인 필요').props.onClick();
  assert.equal(h.calls.length, 1); assert.equal(h.confirms.length, 1);
  assert(text(h.tree).includes('같은 시간 새 기록 보존')); h.destroy();
});


test('web editing after an unknown result preserves the GET recovery control without changing the captured baseline or unlocking mutations', async () => {
  const h = harness(); h.open(); await settle();
  const capturedSave = h.button('저장').props.onClick, capturedDelete = h.button('삭제').props.onClick;
  capturedSave(); h.calls[0].reject(new Error('ack lost')); await settle();
  h.field('업무 내용').props.onChange({ currentTarget: { value: '결과 확인 중 수정한 입력' } }); await settle();
  assert.equal(h.field('업무 내용').props.value, '결과 확인 중 수정한 입력');
  assert(text(h.modal()).includes('결과가 확인되지 않았습니다'));
  assert.equal(h.button('최신 목록 확인').props.disabled, false);
  h.field('시작 시간').props.onChange({ currentTarget: { value: '600' } }); await settle();
  assert.equal(h.field('시작 시간').props.value, 600); assert.equal(h.button('최신 목록 확인').props.disabled, false);
  let dateField; walk(h.modal(), node => { if (node.type === 'DatePickerInput') dateField = node; }); assert(dateField);
  dateField.props.onChange({ currentTarget: { value: '2026-10-04' } }); await settle();
  assert(text(h.modal()).includes('결과가 확인되지 않았습니다'));
  h.button('최신 목록 확인').props.onClick(); assert.equal(h.refreshes, 1);
  h.updateRows([row({ content: '서버 최신 일정', updatedAt: '2026-10-03T00:00:00.009Z' })]); await settle();
  assert.equal(h.field('업무 내용').props.value, '결과 확인 중 수정한 입력');
  assert.equal(h.field('시작 시간').props.value, 600);
  walk(h.modal(), node => { if (node.type === 'DatePickerInput') dateField = node; }); assert.equal(dateField.props.value, '2026-10-04');
  assert.equal(h.button('결과 확인 필요').props.disabled, true); assert.equal(h.button('삭제').props.disabled, true);
  capturedSave(); capturedDelete(); h.button('결과 확인 필요').props.onClick(); h.button('삭제').props.onClick();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].args[6], { manualScheduleId: 'qa-manual-old', expectedUpdatedAt: stamp });
  h.button('최신 목록 확인').props.onClick(); assert.equal(h.refreshes, 2); assert.equal(h.calls.length, 1); h.destroy();
});
