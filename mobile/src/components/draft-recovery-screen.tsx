import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { AccountFeedback } from '@/components/account-feedback';
import { EmptyState, TextAction } from '@/components/ui';
import { useConfirmAction } from '@/components/use-confirm-action';
import { useTheme } from '@/lib/theme';
import type { RecoveryMetadata } from '@/lib/draft-recovery-core';
import { recoveryScopeKey } from '@/lib/draft-recovery-core';
import { useDraftRecovery } from '@/providers/DraftRecoveryProvider';
export function DraftRecoveryScreen() {
  const theme = useTheme(), confirmation = useConfirmAction({ inlineNative: true });
  const cancelConfirmation = confirmation.cancel;
  const { foreground, foregroundRevision, bindingRevision, durable, recoveryUnavailable, isCurrentAccount, isForeground, foregroundGeneration, listMetadata, discard } = useDraftRecovery();
  const focused = useRef(false), sequence = useRef(0), verified = useRef(false), verifiedForeground = useRef(-1), busyRef = useRef(false);
  const [items, setItems] = useState<RecoveryMetadata[] | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [requestStamp, setRequestStamp] = useState(0), [focusState, setFocusState] = useState(false), [validatedForeground, setValidatedForeground] = useState<number | null>(null);
  const renderSequence = requestStamp;
  const current = () => focused.current && isCurrentAccount() && isForeground() && verified.current && verifiedForeground.current === foregroundGeneration() && renderSequence === sequence.current;
  const load = useCallback(async () => {
    if (!focused.current || !isForeground()) return;
    const epoch = ++sequence.current, foregroundAtStart = foregroundGeneration(); setRequestStamp(epoch);
    verified.current = false; setValidatedForeground(null); setLoading(true); setError('');
    const valid = () => focused.current && epoch === sequence.current && foregroundAtStart === foregroundGeneration() && isCurrentAccount() && isForeground();
    try { const result = await listMetadata(); if (!valid()) return; setItems(result); verified.current = true; verifiedForeground.current = foregroundAtStart; setValidatedForeground(foregroundAtStart); }
    catch (cause) { if (valid()) { setItems(null); setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : '보관한 내용을 확인하지 못했습니다.'); } }
    finally { if (valid()) setLoading(false); }
  }, [isForeground, foregroundGeneration, isCurrentAccount, listMetadata]);
  useFocusEffect(useCallback(() => { void foregroundRevision; void bindingRevision; focused.current = true; setFocusState(true); verified.current = false; setItems(null); if (isForeground()) void load(); return () => { focused.current = false; setFocusState(false); verified.current = false; setValidatedForeground(null); sequence.current++; cancelConfirmation(); }; }, [load, foregroundRevision, bindingRevision, isForeground, cancelConfirmation]));
  const open = (item: RecoveryMetadata) => { if (!current() || busyRef.current) return; if (item.scope.kind === 'new') router.push({ pathname: '/drafts/new', params: { scopeId: item.scope.localId } }); else router.push('/drafts/' + item.scope.documentId); };
  const remove = async (item: RecoveryMetadata) => {
    if (!current() || busyRef.current) return;
    const epoch = sequence.current;
    const accepted = await confirmation.ask({ title: '기기 보관 내용 버리기', message: item.pending ? '원 요청의 결과 확인 정보도 삭제합니다. 이미 서버에 처리된 요청은 취소되지 않습니다.' : '이 기기에 보관한 작성 내용을 삭제합니다. 서버에 임시저장한 기안은 삭제하지 않습니다.', confirm: '버리기', danger: true });
    if (!accepted || !current() || epoch !== sequence.current || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { if (!await discard(item.scope, item.revision)) throw new Error('더 최근의 작성 내용이 있어 삭제하지 않았습니다.'); if (current()) await load(); }
    catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '보관 내용을 삭제하지 못했습니다.'); }
    finally { busyRef.current = false; if (focused.current && isCurrentAccount()) setBusy(false); }
  };
  const visible = foreground && focusState && validatedForeground === foregroundRevision && isCurrentAccount();
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView pointerEvents={visible && confirmation.inline ? 'none' : 'auto'} accessibilityElementsHidden={visible && confirmation.inline} importantForAccessibility={visible && confirmation.inline ? 'no-hide-descendants' : 'auto'} contentContainerStyle={{ padding: 16, gap: 8, width: '100%', maxWidth: 720, alignSelf: 'center' }} style={{ backgroundColor: theme.background }}>
    {visible && !confirmation.inline ? confirmation.dialog : null}
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>보관한 작성 내용</Text><TextAction label="새로 확인" disabled={loading || busy || !foreground} onPress={() => { if (focused.current && isForeground()) void load(); }} /></View>
    <Text style={{ color: theme.secondary, fontSize: 13 }}>{visible && items ? `${items.length.toLocaleString('ko-KR')}개 · 최대 4개` : loading && foreground ? '보관 내용 확인 중' : '보관 내용을 확인할 수 없습니다.'}{!durable ? ' · 이 화면에만 보관' : ''}</Text>
    {loading && foreground ? <ActivityIndicator color={theme.accent} /> : null}
    <AccountFeedback error={error || (recoveryUnavailable ? '이 기기에서 작성 내용 보관을 사용할 수 없습니다. 현재 기안 입력은 유지됩니다.' : null)} />
    {visible && items?.length === 0 ? <EmptyState title="보관한 작성 내용이 없습니다" detail="기안 작성 중 입력한 텍스트를 보관할 수 있습니다." /> : null}
    {visible ? items?.map((item, index) => <View key={recoveryScopeKey(item.scope)} role="listitem" style={{ borderBottomWidth: 1, borderColor: theme.border, minHeight: 72, paddingVertical: 8, gap: 4 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}><View style={{ flex: 1, minWidth: 140 }}><Text style={{ color: theme.text, fontWeight: '700' }}>{item.scope.kind === 'new' ? '새 기안' : '기존 기안'} · {index + 1}</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>{new Date(item.savedAt).toLocaleString('ko-KR')} · {item.pending ? '원 요청 확인 필요' : '텍스트 보관'}{item.mode === 'proof-only' ? ' · 결과 확인만 가능' : ''}</Text></View><TextAction label="열기" accessibilityLabel={(item.scope.kind === 'new' ? '새 기안' : '기존 기안') + ' 보관 내용 ' + (index + 1) + ' 열기'} disabled={busy} onPress={() => open(item)} /><TextAction label="버리기" accessibilityLabel={'보관 내용 ' + (index + 1) + ' 버리기'} disabled={busy} onPress={() => void remove(item)} /></View></View>) : null}
    </ScrollView>
    {visible && confirmation.inline ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>{confirmation.dialog}</View> : null}
  </View>;
}
