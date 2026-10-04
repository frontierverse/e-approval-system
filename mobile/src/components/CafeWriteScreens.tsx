/* Input and request snapshots use synchronous refs to reject captured callbacks while a request is locked. */
/* eslint-disable react-hooks/refs */
/* Fresh server snapshots initialize forms before paint; later snapshots remain explicit choices, preserving dirty input. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useLayoutEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { cafeCategories, cafeCategoryLabel, cafeDirty, cafeHoldAllowed, cafeId, cafeInput, cafeValues, defaultCafeFilters, isCafeDetail, isCafeItemPage, validateCafeHold, validateCafeNote, validateCafeValues } from '@/lib/lunch-cafe';
import type { CafeItemValues, MobileCafeItemDetailResponse, MobileCafeItemPage } from '@/types/lunch-cafe';
import { AccountFeedback } from './account-feedback';
import { CafeChoices, LunchCafeField, LunchCafeHeading, LunchCafeReadState } from './LunchCafeContent';
import { useLunchCafeRead } from './lunch-cafe-read';
import { useCafeMutation } from './lunch-cafe-mutation';
import { PrimaryButton, TextAction } from './ui';
import { useConfirmAction } from './use-confirm-action';

function useCafeLeave(dirty: boolean, current: () => boolean, busy: () => boolean) {
  const navigation = useNavigation(), confirmation = useConfirmAction();
  usePreventRemove(dirty, ({ data }) => {
    if (!current() || busy()) return;
    void confirmation.ask({ title: '작성 화면 나가기', message: '저장하지 않은 입력이 사라집니다. 저장 결과가 불명확하다면 원래 요청의 결과를 먼저 확인하세요. 나가시겠습니까?', confirm: '입력 버리고 나가기', danger: true }).then(accepted => { if (accepted && current() && !busy()) navigation.dispatch(data.action); });
  });
  return confirmation;
}
function CafeRecovery({ mutation, current, onRefresh }: { mutation: ReturnType<typeof useCafeMutation>; current(): boolean; onRefresh(): void }) {
  const theme = useTheme();
  if (mutation.state === 'idle') return null;
  return <View style={{ gap: 4, marginVertical: 8 }}><Text style={{ color: theme.secondary, fontSize: 13 }}>{mutation.state === 'uncertain' ? '원래 입력과 요청을 보존했습니다. 같은 요청의 처리 기록부터 확인하세요.' : '내 입력을 보존했습니다. 최신 내용을 확인한 뒤 저장 기준을 선택하세요.'}</Text>{mutation.state === 'uncertain' ? <><TextAction label="원래 저장 결과 확인" disabled={mutation.busy || !current()} onPress={mutation.check} />{mutation.attempt.current?.body ? <TextAction label="같은 저장 요청 재시도" disabled={mutation.busy || !current()} onPress={mutation.retry} /> : null}</> : <TextAction label="최신 내용 확인" disabled={mutation.busy || !current()} onPress={onRefresh} />}</View>;
}

export function CafeItemEditorScreen({ id }: { id?: string }) {
  const theme = useTheme(), insets = useSafeAreaInsets(), [baseline, setBaseline] = useState<MobileCafeItemDetailResponse | null>(null), [latest, setLatest] = useState<MobileCafeItemDetailResponse | null>(null), [values, setValues] = useState<CafeItemValues>(cafeValues(null)), [fields, setFields] = useState<Record<string, string>>({}), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [lost, setLost] = useState(false), [completedId, setCompletedId] = useState<string | null>(null);
  const initialized = useRef(false), initialToday = useRef('');
  const read = useLunchCafeRead<MobileCafeItemDetailResponse | MobileCafeItemPage>(id === undefined ? '/cafe/items?page=1' : cafeId(id) ? `/cafe/items/${id}` : null, (v): v is MobileCafeItemDetailResponse | MobileCafeItemPage => id === undefined ? isCafeItemPage(v, defaultCafeFilters) : isCafeDetail(v, id));
  const wipe = () => { setLost(true); initialized.current = false; setBaseline(null); setLatest(null); setValues(cafeValues(null)); setFields({}); setError(null); setNotice(null); read.invalidate(); };
  const mutation = useCafeMutation({ current: () => read.current() || lost && read.active(), onLoss: wipe, onSuccess: value => {
    setNotice(value.message); setFields({}); setError(null); setLatest(null);
    if (value.result && isCafeDetail(value.result)) { initialized.current = true; setBaseline(value.result); setValues(cafeValues(value.result.item)); if (id !== undefined) read.setData(value.result); }
    if (id === undefined || value.outcome === 'deleted') setCompletedId(value.targetId);
    if (value.outcome === 'deleted') read.invalidate();
    else if (!value.result) { initialized.current = false; setBaseline(null); setValues(cafeValues(null, initialToday.current)); }
  } });
  useLayoutEffect(() => {
    if (!read.data) return;
    setLost(false);
    initialToday.current = read.data.today;
    if (!initialized.current) {
      initialized.current = true;
      if ('item' in read.data) { setBaseline(read.data); setValues(cafeValues(read.data.item)); }
      else setValues(cafeValues(null, read.data.today));
    } else if ('item' in read.data && baseline && read.data.item.updatedAt !== baseline.item.updatedAt) setLatest(read.data);
  }, [read.data, baseline]);
  // The denial transition alone triggers wiping; a render-created wipe callback would erase every edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (read.denied) mutation.loseScope(); }, [read.denied]);
  const dirty = !completedId && cafeDirty(values, baseline?.item ?? null, initialToday.current), confirmation = useCafeLeave(dirty || mutation.locked, read.active, () => mutation.busyRef.current);
  const change = (field: keyof CafeItemValues, value: string) => { if (!read.current() || mutation.busyRef.current || mutation.attempt.current) return; setValues(old => ({ ...old, [field]: value })); setFields(old => { const next = { ...old }; delete next[field]; return next; }); setError(null); mutation.clearValidation(); };
  const save = async () => {
    if (!read.current() || mutation.busyRef.current || mutation.attempt.current || completedId || latest || id !== undefined && !baseline) return;
    const errors = validateCafeValues(values); setFields(errors); setError(Object.keys(errors).length ? '입력한 내용을 확인하세요.' : null);
    if (Object.keys(errors).length) return;
    await mutation.submit({ operation: id === undefined ? 'item.create' : 'item.update', ...(id === undefined ? {} : { targetId: id }), path: id === undefined ? '/cafe/items' : `/cafe/items/${id}`, method: id === undefined ? 'POST' : 'PUT', body: { input: cafeInput(values), ...(id === undefined ? {} : { expectedUpdatedAt: baseline!.item.updatedAt }) } });
  };
  const adopt = async (replace: boolean) => {
    if (!latest || !read.current() || mutation.busyRef.current || mutation.state === 'uncertain') return;
    const snapshot = latest;
    if (replace && !await confirmation.ask({ title: '서버 내용으로 교체', message: '현재 입력이 사라지고 최신 물품 내용으로 바뀝니다. 교체하시겠습니까?', confirm: '교체' })) return;
    if (!read.current() || mutation.busyRef.current || latest !== snapshot) return;
    if (mutation.state === 'conflict' && !mutation.resetConflict()) return;
    setBaseline(snapshot); if (replace) setValues(cafeValues(snapshot.item)); setLatest(null); setFields({}); setError(null); setNotice('최신 저장 기준을 선택했습니다. 내용을 확인한 뒤 저장하세요.');
  };
  const visible = !!read.data && !lost;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={64}>
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <LunchCafeHeading title={id === undefined ? '물품 등록' : '물품 수정'} />
      <AccountFeedback error={error ?? mutation.error} message={notice} />
      <LunchCafeReadState loading={read.loading} error={read.error} hasData={visible} retry={read.refresh} />
      <CafeRecovery mutation={mutation} current={read.active} onRefresh={async () => { const result = await read.load(true); if (result && 'item' in result && read.current()) setLatest(result); }} />
      {completedId ? <View><Text style={{color:theme.secondary}}>원래 저장 결과를 확인했습니다. 현재 삭제된 물품은 다시 생성하지 않습니다.</Text><TextAction label="새 물품 등록" disabled={id !== undefined || !read.current()} onPress={() => { if (id !== undefined || !read.current() || mutation.busyRef.current) return; setCompletedId(null); setBaseline(null); setValues(cafeValues(null, initialToday.current)); setNotice(null); }} /></View> : null}
      {latest && visible ? <View style={{ padding: 10, backgroundColor: theme.surfaceMuted, gap: 4 }}><Text style={{ color: theme.text, fontWeight: '600' }}>다른 변경이 있습니다 · 최신 내용</Text><Text style={{ color: theme.secondary }}>{latest.item.name} · {cafeCategoryLabel(latest.item.category)}{'\n'}구매일 {latest.item.purchasedAt} · 가격 {latest.item.priceWon === null ? '미등록' : `${latest.item.priceWon.toLocaleString('ko-KR')}원`}{'\n'}유통기한 {latest.item.expirationDate ?? '미등록'}{'\n'}구매 사유: {latest.item.purchaseReason || '없음'}</Text><Text style={{color:theme.secondary,fontSize:12}}>내 입력은 아래에 보존했습니다.</Text><TextAction label="입력 유지·최신 기준 선택" onPress={() => adopt(false)} disabled={mutation.busy} /><TextAction label="서버 내용으로 교체" onPress={() => adopt(true)} disabled={mutation.busy} /></View> : null}
      {visible && !completedId ? <View><LunchCafeField label="물품명" value={values.name} onChange={value => change('name', value)} maxLength={100} error={fields.name ?? mutation.fields.name} disabled={mutation.locked} /><Text style={{ color: theme.text, marginTop: 12, fontWeight: '600' }}>분류</Text><CafeChoices label="물품 분류" options={cafeCategories} value={values.category} onChange={value => change('category', value)} disabled={mutation.locked} /><LunchCafeField label="구매일" value={values.purchasedAt} onChange={value => change('purchasedAt', value)} hint="YYYY-MM-DD" error={fields.purchasedAt ?? mutation.fields.purchasedAt} disabled={mutation.locked} /><LunchCafeField label="가격 (원)" value={values.priceWon} onChange={value => change('priceWon', value)} keyboardType="number-pad" hint="미등록은 빈칸 · 0원도 입력할 수 있습니다." error={fields.priceWon ?? mutation.fields.priceWon} disabled={mutation.locked} /><LunchCafeField label="구매 사유" value={values.purchaseReason} onChange={value => change('purchaseReason', value)} multiline maxLength={500} error={fields.purchaseReason ?? mutation.fields.purchaseReason} disabled={mutation.locked} />{values.category === 'food' ? <LunchCafeField label="유통기한" value={values.expirationDate} onChange={value => change('expirationDate', value)} hint="식품 필수 · YYYY-MM-DD" error={fields.expirationDate ?? mutation.fields.expirationDate} disabled={mutation.locked} /> : null}<Text style={{ color: theme.secondary, fontSize: 12, marginTop: 12 }}>직원 공용 물품입니다. 저장한 내용은 다른 직원에게도 반영됩니다.</Text></View> : null}
    </ScrollView>
    {visible && !completedId ? <View style={{ padding: 12, paddingBottom: Math.max(12, insets.bottom), borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface }}><PrimaryButton title={mutation.busy ? '저장 중' : '저장'} disabled={!read.current() || mutation.locked || !!latest} onPress={save} /></View> : null}
    {confirmation.dialog}
  </KeyboardAvoidingView>;
}

export function CafeItemHoldScreen({ id }: { id: string }) {
  const theme = useTheme(), insets = useSafeAreaInsets(), [reason, setReason] = useState(''), [baseline, setBaseline] = useState<MobileCafeItemDetailResponse | null>(null), [latest, setLatest] = useState<MobileCafeItemDetailResponse | null>(null), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [lost, setLost] = useState(false);
  const read = useLunchCafeRead<MobileCafeItemDetailResponse>(cafeId(id) ? `/cafe/items/${id}` : null, value => isCafeDetail(value, id));
  const mutation = useCafeMutation({ current: () => read.current() || lost && read.active(), onLoss: () => { read.invalidate(); setLost(true); setReason(''); setBaseline(null); setLatest(null); }, onSuccess: value => { setNotice(value.message); setError(null); setReason(''); setLatest(null); if (isCafeDetail(value.result)) { setBaseline(value.result); read.setData(value.result); } } });
  useLayoutEffect(() => { if (!read.data) return; setLost(false); if (!baseline) setBaseline(read.data); else if (baseline.item.updatedAt !== read.data.item.updatedAt) setLatest(read.data); }, [read.data, baseline]);
  // The denial transition is the privacy boundary; depending on a render-created callback would erase every input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (read.denied) mutation.loseScope(); }, [read.denied]);
  const confirmation = useCafeLeave(!!reason || mutation.locked, read.active, () => mutation.busyRef.current);
  const allowed = !!read.data && cafeHoldAllowed(read.data), visible = !!read.data && !lost;
  const save = async () => {
    if (!read.current() || !baseline || !allowed || latest || mutation.busyRef.current || mutation.attempt.current) return;
    const validation = validateCafeHold(reason); setError(validation); if (validation) return;
    await mutation.submit({ operation: 'item.hold', targetId: id, path: `/cafe/items/${id}/hold`, method: 'POST', body: { expectedUpdatedAt: baseline.item.updatedAt, reason: reason.trim() } });
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={64}><ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled"><LunchCafeHeading title="유통기한 보류" /><AccountFeedback error={error ?? mutation.error} message={notice} /><LunchCafeReadState loading={read.loading} error={read.error} hasData={visible} retry={read.refresh} /><CafeRecovery mutation={mutation} current={read.active} onRefresh={async () => { const result = await read.load(true); if (result && read.current()) setLatest(result); }} />{visible ? <><Text style={{ color: theme.text, fontWeight: '600' }}>{read.data!.item.name}</Text><Text style={{ color: theme.secondary, marginTop: 8 }}>유통기한이 지난 식품의 보류 사유를 남깁니다. 기한 경과 표시는 유지됩니다.</Text>{!allowed ? <AccountFeedback error="현재 보류할 수 있는 기한 경과 식품이 아닙니다." /> : null}<LunchCafeField label="보류 사유" value={reason} onChange={value => { if (read.current() && !mutation.busyRef.current && !mutation.attempt.current) { setReason(value); setError(null); mutation.clearValidation(); } }} multiline maxLength={500} disabled={mutation.locked || !allowed} error={mutation.fields.reason} />{latest ? <><Text style={{ color: theme.secondary, marginTop: 12 }}>물품이 변경되었습니다. 최신 내용을 확인하고 기준을 선택하세요.</Text><Text style={{ color: theme.text }}>{latest.item.name} · 기한 {latest.item.expirationDate ?? '없음'}{'\n'}현재 보류 사유: {latest.item.expirationHoldReason ?? '없음'}</Text><TextAction label="사유 유지·최신 기준 선택" disabled={mutation.busy} onPress={() => { if (!read.current() || mutation.busyRef.current || mutation.state === 'uncertain' || !latest) return; if (mutation.state === 'conflict' && !mutation.resetConflict()) return; setBaseline(latest); setLatest(null); setError(null); }} /></> : null}</> : null}</ScrollView>{visible ? <View style={{ padding: 12, paddingBottom: Math.max(12, insets.bottom), backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border }}><PrimaryButton title={mutation.busy ? '저장 중' : '보류 사유 저장'} disabled={!read.current() || mutation.locked || !allowed || !!latest} onPress={save} /></View> : null}{confirmation.dialog}</KeyboardAvoidingView>;
}

export function CafeNoteEditorScreen() {
  const theme = useTheme(), insets = useSafeAreaInsets(), [content, setContent] = useState(''), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [lost, setLost] = useState(false);
  const read = useLunchCafeRead<MobileCafeItemPage>('/cafe/items?page=1', value => isCafeItemPage(value, defaultCafeFilters));
  const mutation = useCafeMutation({ current: () => read.current() || lost && read.active(), onLoss: () => { read.invalidate(); setLost(true); setContent(''); }, onSuccess: value => { setContent(''); setError(null); setNotice(value.message); } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (read.denied) mutation.loseScope(); }, [read.denied]);
  useLayoutEffect(() => { if (read.data) setLost(false); }, [read.data]);
  const confirmation = useCafeLeave(!!content || mutation.locked, read.active, () => mutation.busyRef.current);
  const visible = !!read.data && !lost;
  const save = async () => { if (!read.current() || mutation.busyRef.current || mutation.attempt.current) return; const validation = validateCafeNote(content); setError(validation); if (validation) return; await mutation.submit({ operation: 'note.create', path: '/cafe/notes', method: 'POST', body: { content: content.trim() } }); };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={64}><ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled"><LunchCafeHeading title="준수사항 등록" /><AccountFeedback error={error ?? mutation.error} message={notice} /><LunchCafeReadState loading={read.loading} error={read.error} hasData={visible} retry={read.refresh} /><CafeRecovery mutation={mutation} current={read.active} onRefresh={() => void read.load(true)} />{visible ? <><Text style={{ color: theme.secondary, marginTop: 8 }}>모든 직원이 함께 보는 카페 준수사항입니다.</Text><LunchCafeField label="준수사항" value={content} onChange={value => { if (read.current() && !mutation.busyRef.current && !mutation.attempt.current) { setContent(value); setError(null); mutation.clearValidation(); } }} multiline maxLength={2000} error={mutation.fields.content} disabled={mutation.locked} /></> : null}</ScrollView>{visible ? <View style={{ padding: 12, paddingBottom: Math.max(12, insets.bottom), backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border }}><PrimaryButton title={mutation.busy ? '등록 중' : '등록'} disabled={!read.current() || mutation.locked} onPress={save} /></View> : null}{confirmation.dialog}</KeyboardAvoidingView>;
}
