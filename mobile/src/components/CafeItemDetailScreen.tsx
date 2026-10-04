import { useLayoutEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { cafeCategoryLabel, cafeHoldAllowed, cafeId, formatCafeTimestamp, formatMealDate, isCafeDetail } from '@/lib/lunch-cafe';
import type { MobileCafeItemDetailResponse } from '@/types/lunch-cafe';
import { AccountFeedback } from './account-feedback';
import { LunchCafeHeading, LunchCafeReadState, LunchCafeRow } from './LunchCafeContent';
import { useLunchCafeRead } from './lunch-cafe-read';
import { useCafeMutation } from './lunch-cafe-mutation';
import { TextAction } from './ui';
import { useConfirmAction } from './use-confirm-action';
export function CafeItemDetailScreen({ id }: { id: string }) {
  const theme = useTheme(), [notice, setNotice] = useState<string | null>(null), [deleted, setDeleted] = useState(false), [lost, setLost] = useState(false), { ask, dialog } = useConfirmAction();
  const read = useLunchCafeRead<MobileCafeItemDetailResponse>(cafeId(id) ? `/cafe/items/${id}` : null, value => isCafeDetail(value, id));
  const mutation = useCafeMutation({ current: () => read.current() || lost && read.active(), onLoss: () => { setLost(true); read.invalidate(); }, onSuccess: value => { setNotice(value.message); setDeleted(true); read.invalidate(); } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (read.denied && !deleted) mutation.loseScope(); }, [read.denied, deleted]);
  const data = deleted ? null : read.data, item = data?.item;
  const remove = async () => {
    if (!read.current() || !item || mutation.busyRef.current || mutation.locked) return;
    const baseline = item.updatedAt;
    if (!await ask({ title: '물품 삭제', message: `“${item.name}”을 삭제하시겠습니까? 삭제한 물품은 복구할 수 없으며 변경 이력은 남습니다.`, confirm: '삭제', danger: true })) return;
    if (!read.current() || mutation.busyRef.current) return;
    await mutation.submit({ operation: 'item.delete', targetId: id, path: `/cafe/items/${id}`, method: 'DELETE', body: { expectedUpdatedAt: baseline } });
  };
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 24 }}>
    <LunchCafeHeading title={deleted ? '물품 삭제 완료' : '물품 정보'} />
    <AccountFeedback error={mutation.error} message={notice} />
    {!deleted ? <LunchCafeReadState loading={read.loading} error={read.error} hasData={!!data} retry={read.refresh} /> : null}
    {item ? <View><Text accessibilityRole="header" aria-level={3} style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{item.name}</Text><LunchCafeRow title={`${cafeCategoryLabel(item.category)} · ${item.usage.label}${item.isHeld ? ' · 보류' : ''}`} description={item.usage.basisLabel} /><LunchCafeRow title={`구매일 ${formatMealDate(item.purchasedAt)}`} description={item.priceWon === null ? '가격 미등록' : `${item.priceWon.toLocaleString('ko-KR')}원`} /><LunchCafeRow title={`유통기한 ${item.expirationDate ? formatMealDate(item.expirationDate) : '미등록'}`} /><LunchCafeRow title="구매 사유" description={item.purchaseReason || '미등록'} />{item.isHeld ? <LunchCafeRow title="보류 사유" description={item.expirationHoldReason || '사유 미등록'} /> : null}<Text style={{ color: theme.secondary, fontSize: 12, marginTop: 8 }}>등록 {formatCafeTimestamp(item.createdAt)}{'\n'}수정 {formatCafeTimestamp(item.updatedAt)}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}><TextAction label="물품 수정" disabled={!read.current() || mutation.locked} onPress={() => { if (read.current() && !mutation.busyRef.current && !mutation.locked) router.push({ pathname: '/cafe/items/[id]/edit', params: { id } }); }} />{data && cafeHoldAllowed(data) ? <TextAction label="유통기한 보류" disabled={!read.current() || mutation.locked} onPress={() => { if (read.current() && !mutation.busyRef.current && !mutation.locked) router.push({ pathname: '/cafe/items/[id]/hold', params: { id } }); }} /> : null}<TextAction label="삭제" disabled={!read.current() || mutation.locked} onPress={remove} /></View></View> : null}
    {mutation.state === 'uncertain' ? <View><Text style={{ color: theme.secondary }}>원래 삭제 요청을 보존했습니다. 상세 조회의 부재만으로 삭제 성공을 판단하지 않습니다.</Text><TextAction label="원래 요청의 결과 확인" disabled={mutation.busy || !read.active()} onPress={mutation.check} />{mutation.attempt.current?.body ? <TextAction label="같은 삭제 요청 재시도" disabled={mutation.busy || !read.active()} onPress={mutation.retry} /> : null}</View> : null}
    {mutation.state === 'conflict' ? <TextAction label="최신 물품 확인" disabled={mutation.busy || read.loading} onPress={async () => { await read.load(true); if (read.current()) mutation.resetConflict(); }} /> : null}
    <TextAction label="이 물품 변경 이력" disabled={!read.active()} onPress={() => { if (read.active()) router.push({ pathname: '/cafe/history', params: { itemId: id } }); }} />
    <TextAction label="물품 목록" onPress={() => { if (read.active()) router.push('/cafe'); }} disabled={!read.active()} />
    {read.current() ? dialog : null}
  </ScrollView>;
}
