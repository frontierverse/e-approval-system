import { useLayoutEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { cafeActions, cafeCategories, cafeCategoryLabel, cafeDeadlines, cafeHistoryPath, cafeId, cafeItemPath, cafeSorts, defaultCafeFilters, defaultCafeHistory, formatCafeTimestamp, formatMealDate, isCafeHistory, isCafeItemPage, isCafeNotes, isMealDate, isMealMenu, shiftMealDate } from '@/lib/lunch-cafe';
import type { CafeHistoryFilters, CafeItemFilters, MobileCafeHistoryResponse, MobileCafeItemPage, MobileCafeNotePage, MobileMealMenuResponse } from '@/types/lunch-cafe';
import { AccountFeedback } from './account-feedback';
import { CafeChoices, LunchCafeField, LunchCafeHeading, LunchCafePager, LunchCafeReadState, LunchCafeRow } from './LunchCafeContent';
import { useLunchCafeRead } from './lunch-cafe-read';
import { useCafeMutation } from './lunch-cafe-mutation';
import { TextAction } from './ui';
import { useConfirmAction } from './use-confirm-action';

export function MealMenuScreen({ date }: { date?: string }) {
  const theme = useTheme(), [expanded, setExpanded] = useState(false), [conditions, setConditions] = useState(false), [dateInput, setDateInput] = useState(date ?? ''), [inputError, setInputError] = useState<string | null>(null);
  const validDate = date === undefined || isMealDate(date);
  const read = useLunchCafeRead<MobileMealMenuResponse>(validDate ? date === undefined ? '/meal-menu' : `/meal-menu?date=${date}` : null, value => isMealMenu(value, date));
  const data = read.data, selected = data?.date, previous = selected ? shiftMealDate(selected, -1) : null, next = selected ? shiftMealDate(selected, 1) : null;
  const navigate = (value?: string) => { if (!read.current()) return; router.setParams({ date: value }); };
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 12, gap: 4, paddingBottom: 24 }}>
    <LunchCafeHeading title="메뉴·수량" actions={<TextAction label="카페 물품" disabled={!read.current()} onPress={() => { if (read.current()) router.push('/cafe'); }} />} />
    {data ? <View style={{ padding: 8, backgroundColor: theme.surface, gap: 3 }}><Text style={{ color: theme.text, fontWeight: '700' }}>도시락 합계 {data.summary.totalCount.toLocaleString('ko-KR')}개 · 학교 {data.summary.schoolCount.toLocaleString('ko-KR')}곳</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>보존식 {data.summary.preservationCount.toLocaleString('ko-KR')} · 배송기사 {data.summary.deliveryDriverCount.toLocaleString('ko-KR')} 포함</Text></View> : null}
    {data ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}><TextAction label="이전 날" disabled={!previous || read.loading} onPress={() => previous && navigate(previous)} /><Text style={{ color: theme.text, fontWeight: '600', flexShrink: 1 }}>{formatMealDate(data.date)}</Text><TextAction label="다음 날" disabled={!next || read.loading} onPress={() => next && navigate(next)} /></View> : null}
    <LunchCafeReadState loading={read.loading} error={read.error} hasData={!!data} retry={read.refresh} />
    {data && data.menuItems.length ? <View accessibilityRole="list" accessibilityLabel="급식 메뉴">{data.menuItems.map((item, index) => <View key={`${index}:${item}`} role="listitem"><LunchCafeRow title={item} /></View>)}</View> : data && !read.loading && !read.error ? <Text style={{ padding: 12, color: theme.secondary }}>등록된 메뉴가 없습니다.</Text> : null}
    <TextAction label={conditions ? '날짜 선택 접기' : '날짜 선택'} onPress={() => setConditions(!conditions)} />
    {conditions || !validDate ? <View><LunchCafeField label="조회 날짜" value={dateInput} onChange={setDateInput} hint="YYYY-MM-DD · 이전·이후 날짜 모두 조회할 수 있습니다." error={inputError ?? undefined} /><AccountFeedback error={inputError} /><View style={{ flexDirection: 'row', gap: 8 }}><TextAction label="날짜 조회" onPress={() => { if (!isMealDate(dateInput)) { setInputError('날짜를 YYYY-MM-DD 형식으로 입력하세요.'); return; } if (!read.active()) return; router.setParams({ date: dateInput }); }} /><TextAction label="오늘 따라가기" onPress={() => { if (!read.active()) return; router.replace('/meal-menu'); }} /></View></View> : null}
    {data ? <><TextAction label={expanded ? '학교별 수량 접기' : '학교별 수량 보기'} onPress={() => setExpanded(!expanded)} />{expanded ? <View accessibilityRole="list" accessibilityLabel="학교별 수량">{data.schools.map(item => <View key={item.schoolId} role="listitem"><LunchCafeRow title={item.schoolName} description={`합계 ${item.totalCount.toLocaleString('ko-KR')} · 보존식 ${item.preservationCount.toLocaleString('ko-KR')} · 배송기사 ${item.deliveryDriverCount.toLocaleString('ko-KR')}`} /></View>)}</View> : null}</> : null}
  </ScrollView>;
}

export function CafeItemsScreen() {
  const theme = useTheme(), [filters, setFilters] = useState<CafeItemFilters>(defaultCafeFilters), [page, setPage] = useState(1), [expanded, setExpanded] = useState(false), [query, setQuery] = useState(''), [error, setError] = useState<string | null>(null);
  const read = useLunchCafeRead<MobileCafeItemPage>(cafeItemPath(filters, page), value => isCafeItemPage(value, filters));
  const data = read.data;
  const apply = (values: Partial<CafeItemFilters>) => { if (!read.current()) return; setFilters(old => ({ ...old, ...values })); setPage(1); };
  const navigate = (path: '/cafe/items/new' | '/cafe/history' | '/cafe/notes') => { if (read.current()) router.push(path); };
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 12, gap: 4, paddingBottom: 24 }}>
    <LunchCafeHeading title="물품 현황" actions={<TextAction label="물품 등록" disabled={!read.current()} onPress={() => navigate('/cafe/items/new')} />} />
    {data ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: theme.surface }}><TextAction label={`기한 경과 ${data.summary.expiredFoodCount.toLocaleString('ko-KR')}`} onPress={() => apply({ category: 'food', deadline: 'expired', held: 'all' })} /><TextAction label={`30일 이내 ${data.summary.dueSoonFoodCount.toLocaleString('ko-KR')}`} onPress={() => apply({ category: 'food', deadline: 'dueSoon', held: 'all' })} /><TextAction label={`보류 ${data.summary.heldItemCount.toLocaleString('ko-KR')}`} onPress={() => apply({ category: 'all', deadline: 'all', held: 'only' })} /></View> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: theme.secondary, fontSize: 13 }}>{data ? `${read.loading || read.error ? '이전 조회 ' : ''}${data.total.toLocaleString('ko-KR')}건` : read.loading ? '목록 불러오는 중' : '목록 확인 불가'}</Text><TextAction label={expanded ? '조회 조건 접기' : '조회 조건'} onPress={() => setExpanded(!expanded)} /></View>
    {expanded ? <View><LunchCafeField label="물품 검색" value={query} onChange={setQuery} maxLength={200} placeholder="물품명 또는 구매 사유" /><TextAction label="검색 적용" disabled={!read.current()} onPress={() => apply({ query: query.trim() })} /><CafeChoices label="물품 분류" options={[{ value: 'all', label: '전체 분류' }, ...cafeCategories]} value={filters.category} onChange={value => apply({ category: value })} disabled={!read.current()} /><CafeChoices label="기한 조건" options={cafeDeadlines} value={filters.deadline} onChange={value => apply({ deadline: value })} disabled={!read.current()} /><CafeChoices label="정렬" options={cafeSorts} value={filters.sort} onChange={value => apply({ sort: value })} disabled={!read.current()} /><CafeChoices label="보류 여부" options={[{ value: 'all', label: '보류 포함 전체' }, { value: 'only', label: '보류만' }]} value={filters.held} onChange={value => apply({ held: value })} disabled={!read.current()} /><TextAction label="조건 초기화" disabled={!read.current()} onPress={() => { setQuery(''); setError(null); apply(defaultCafeFilters); }} /></View> : null}
    <LunchCafeReadState loading={read.loading} error={read.error ?? error} hasData={!!data} retry={read.refresh} />
    {data ? <View accessibilityRole="list" accessibilityLabel="카페 물품 목록">{data.items.map(item => <View key={item.id} role="listitem"><LunchCafeRow title={item.name} description={`${cafeCategoryLabel(item.category)} · ${item.usage.basisLabel} ${item.usage.label}${item.isHeld ? ' · 보류' : ''} · 구매 ${item.purchasedAt}`} disabled={!read.current()} onPress={() => { if (read.current()) router.push({ pathname: '/cafe/items/[id]', params: { id: item.id } }); }} /></View>)}</View> : null}
    {data && !data.items.length && !read.loading && !read.error ? <Text style={{ color: theme.secondary, padding: 12 }}>조회 조건에 맞는 물품이 없습니다.</Text> : null}
    {data ? <LunchCafePager page={data.page} totalPages={data.totalPages} disabled={!read.current()} onPage={value => { if (read.current()) setPage(value); }} /> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><TextAction label="변경 이력" disabled={!read.current()} onPress={() => navigate('/cafe/history')} /><TextAction label="준수사항" disabled={!read.current()} onPress={() => navigate('/cafe/notes')} /></View>
  </ScrollView>;
}

export function CafeHistoryScreen({ itemId }: { itemId?: string }) {
  const theme = useTheme(), [filters, setFilters] = useState<CafeHistoryFilters>({ ...defaultCafeHistory, itemId: itemId ?? null }), [page, setPage] = useState(1), [expanded, setExpanded] = useState(false), [query, setQuery] = useState('');
  const valid = itemId === undefined || cafeId(itemId);
  const read = useLunchCafeRead<MobileCafeHistoryResponse>(valid ? cafeHistoryPath(filters, page) : null, value => isCafeHistory(value, filters)), data = read.data;
  const apply = (value: Partial<CafeHistoryFilters>) => { if (read.current()) { setFilters(old => ({ ...old, ...value })); setPage(1); } };
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 12, gap: 4, paddingBottom: 24 }}>
    <LunchCafeHeading title="물품 변경 이력" actions={<TextAction label={expanded ? '조회 조건 접기' : '조회 조건'} onPress={() => setExpanded(!expanded)} />} />
    <Text style={{ color: theme.secondary }}>{data ? `${read.loading || read.error ? '이전 조회 ' : ''}${data.total.toLocaleString('ko-KR')}건` : read.loading ? '이력 불러오는 중' : '이력 확인 불가'}</Text>
    {expanded ? <View><LunchCafeField label="이력 검색" value={query} onChange={setQuery} maxLength={200} placeholder="물품명 또는 직원명" /><TextAction label="검색 적용" disabled={!read.current()} onPress={() => apply({ query: query.trim() })} /><CafeChoices label="작업 종류" options={cafeActions} value={filters.action} onChange={value => apply({ action: value })} disabled={!read.current()} /><CafeChoices label="작업자" options={[{ value: 'all', label: '전체 직원' }, ...(data?.actors.map(x => ({ value: x.id, label: x.name })) ?? [])]} value={filters.actorId} onChange={value => apply({ actorId: value })} disabled={!read.current()} /></View> : null}
    <LunchCafeReadState loading={read.loading} error={read.error} hasData={!!data} retry={read.refresh} />
    {data ? <View accessibilityRole="list" accessibilityLabel="물품 변경 이력">{data.logs.map(item => <View key={item.id} role="listitem"><LunchCafeRow title={item.message} description={`${item.actor.name} · ${formatCafeTimestamp(item.createdAt)}`} /></View>)}</View> : null}
    {data && !data.logs.length && !read.loading && !read.error ? <Text style={{ color: theme.secondary, padding: 12 }}>변경 이력이 없습니다.</Text> : null}
    {data ? <LunchCafePager page={data.page} totalPages={data.totalPages} disabled={!read.current()} onPage={value => { if (read.current()) setPage(value); }} /> : null}
  </ScrollView>;
}

export function CafeNotesScreen() {
  const theme = useTheme(), [page, setPage] = useState(1), [notice, setNotice] = useState<string | null>(null), [opened, setOpened] = useState<string[]>([]), [lost, setLost] = useState(false);
  const read = useLunchCafeRead<MobileCafeNotePage>(`/cafe/notes?page=${page}`, isCafeNotes), { ask, dialog } = useConfirmAction();
  const mutation = useCafeMutation({ current: () => read.current() || lost && read.active(), onLoss: () => { setLost(true); read.invalidate(); }, onSuccess: value => { setNotice(value.message); void read.refresh(); } });
  // A confirmed permission/target loss removes the private attempt body while preserving its opaque proof key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (read.denied) mutation.loseScope(); }, [read.denied]);
  const data = read.data;
  const remove = async (id: string, updatedAt: string, content: string) => {
    if (!read.current() || mutation.busyRef.current || mutation.locked) return;
    if (!await ask({ title: '준수사항 삭제', message: `“${content.slice(0, 120)}${content.length > 120 ? '…' : ''}”을 삭제하시겠습니까? 삭제한 준수사항은 복구할 수 없습니다.`, confirm: '삭제', danger: true })) return;
    if (!read.current() || mutation.busyRef.current) return;
    await mutation.submit({ operation: 'note.delete', targetId: id, path: `/cafe/notes/${id}`, method: 'DELETE', body: { expectedUpdatedAt: updatedAt } });
  };
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 12, gap: 4, paddingBottom: 24 }}>
    <LunchCafeHeading title="카페 준수사항" actions={<TextAction label="준수사항 등록" disabled={!read.current() || mutation.locked} onPress={() => { if (read.current() && !mutation.busyRef.current && !mutation.locked) router.push('/cafe/notes/new'); }} />} />
    <Text style={{ color: theme.secondary }}>{data ? `${read.loading || read.error ? '이전 조회 ' : ''}${data.total.toLocaleString('ko-KR')}건 · 직원 공용` : read.loading ? '목록 불러오는 중' : '목록 확인 불가'}</Text>
    <AccountFeedback error={mutation.error} message={notice} />
    {mutation.state === 'uncertain' ? <View><TextAction label="원래 요청의 결과 확인" disabled={mutation.busy || !read.current()} onPress={mutation.check} /><TextAction label="같은 삭제 요청 재시도" disabled={mutation.busy || !read.current()} onPress={mutation.retry} /></View> : null}
    {mutation.state === 'conflict' ? <TextAction label="최신 목록 확인" disabled={mutation.busy || read.loading} onPress={async () => { await read.load(true); if (read.current()) mutation.resetConflict(); }} /> : null}
    <LunchCafeReadState loading={read.loading} error={read.error} hasData={!!data} retry={read.refresh} />
    {data ? <View accessibilityRole="list" accessibilityLabel="준수사항 목록">{data.notes.map(item => <View key={item.id} role="listitem" style={{ backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border, padding: 10, gap: 4 }}><Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }} numberOfLines={opened.includes(item.id) ? undefined : 4}>{item.content}</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>{item.createdBy?.name ?? '삭제된 직원'} · {formatCafeTimestamp(item.createdAt)}</Text><View style={{ flexDirection: 'row', gap: 8 }}><TextAction label={opened.includes(item.id) ? '내용 접기' : '내용 펼침'} disabled={!read.current()} onPress={() => { if (read.current()) setOpened(old => old.includes(item.id) ? old.filter(x => x !== item.id) : [...old, item.id]); }} /><TextAction label="삭제" disabled={!read.current() || mutation.locked} onPress={() => remove(item.id, item.updatedAt, item.content)} /></View></View>)}</View> : null}
    {data && !data.notes.length && !read.loading && !read.error ? <Text style={{ color: theme.secondary, padding: 12 }}>등록된 준수사항이 없습니다.</Text> : null}
    {data ? <LunchCafePager page={data.page} totalPages={data.totalPages} disabled={!read.current() || mutation.locked} onPage={value => { if (read.current() && !mutation.locked) setPage(value); }} /> : null}
    {read.current() ? dialog : null}
  </ScrollView>;
}
