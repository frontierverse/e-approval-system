import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { router, useFocusEffect } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountFeedback } from '@/components/account-feedback';
import { ErrorState, PrimaryButton, TextAction } from '@/components/ui';
import { useConfirmAction } from '@/components/use-confirm-action';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { attachmentError, fileSize, requestKey, type DraftAttachment, type DraftData, type DraftField, type DraftOptions, type PendingAttachment } from '@/lib/drafts';
import { canonicalDraftText, compatibleRecoveryText, draftId, draftRequestId, isDraftData, isDraftOptions, isDraftRequestStatus, isDraftSaveResult, matchesDraftProof, recoveryAbort, recoveryScopeKey, recoveryText, templateFingerprint, type DraftCommitProof, type DraftRequestStatus, type FrozenDraftText, type RecoveryMetadata, type RecoveryRecord, type RecoveryScope } from '@/lib/draft-recovery-core';
import { readMeetingItems, writeMeetingItems } from '@/lib/meeting-items';
import { uploadFile } from '@/lib/upload-file';
import { useDraftRecovery } from '@/providers/DraftRecoveryProvider';

type Form = { title: string; templateId: string; values: Record<string, string>; approverIds: string[]; attachments: DraftAttachment[]; updatedAt: string | null };
type Body = FrozenDraftText & { uploadIds: string[]; intent: 'draft' | 'submit'; expectedUpdatedAt: string | null; requestId: string };
type Pending = { requestId: string; intent: 'draft' | 'submit'; revision: number; expectedUpdatedAt: string | null; stage: 'prepared' | 'sent' | 'unknown'; hasNewUploads: boolean; fingerprint: string; body: Body | null };
const emptyForm = (): Form => ({ title: '', templateId: '', values: {}, approverIds: [], attachments: [], updatedAt: null });
function formSnapshot(form: Form, files: PendingAttachment[]) { return JSON.stringify({ title: form.title, templateId: form.templateId, values: form.values, approverIds: form.approverIds, attachments: form.attachments.map(file => file.id), files: files.map(file => file.key) }); }
function unknown(cause: unknown) { return !(cause instanceof ApiError) || cause.status === 0 || cause.status === 408 || cause.status >= 500 || cause.status >= 200 && cause.status < 300; }
function message(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
export function DraftEditor({ documentId, localScopeId }: { documentId?: string; localScopeId?: string }) {
  const { user } = useSession();
  const [local] = useState(() => localScopeId ?? requestKey());
  const scope = useMemo<RecoveryScope>(() => documentId ? { kind: 'document', documentId } : { kind: 'new', localId: local }, [documentId, local]);
  if (documentId !== undefined && !draftId(documentId) || localScopeId !== undefined && !draftId(localScopeId)) return <Text style={{ padding: 16 }}>작성 범위를 확인하세요.</Text>;
  return <ScopedDraftEditor key={`${user?.id ?? ''}:${documentId ?? local}`} scope={scope} />;
}
function ScopedDraftEditor({ scope }: { scope: RecoveryScope }) {
  const theme = useTheme(), insets = useSafeAreaInsets(), navigation = useNavigation(), confirmation = useConfirmAction({ inlineNative: true });
  const cancelConfirmation = confirmation.cancel;
  const { actorId, foreground, foregroundRevision, bindingRevision, storageReady, recoveryUnavailable, durable, isCurrentAccount, isForeground, foregroundGeneration, request, listMetadata, loadForExplicitRestore, checkpoint, restrictScope, purgeScope, discard } = useDraftRecovery();
  const documentId = scope.kind === 'document' ? scope.documentId : undefined;
  const alive = useRef(false), focused = useRef(false), focusEpoch = useRef(0), verified = useRef(false), verifiedForeground = useRef(-1), loadSequence = useRef(0);
  const initialized = useRef(false), formRef = useRef<Form>(emptyForm()), filesRef = useRef<PendingAttachment[]>([]), baseline = useRef(''), revision = useRef(1), pending = useRef<Pending | null>(null), busyRef = useRef(false), allowLeave = useRef(false), checkpointRef = useRef<(() => Promise<boolean>) | null>(null);
  const [form, setForm] = useState<Form>(emptyForm()), [files, setFiles] = useState<PendingAttachment[]>([]), [options, setOptions] = useState<DraftOptions | null>(null), optionsRef = useRef<DraftOptions | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState(''), [errors, setErrors] = useState<Record<string, string>>({}), [notice, setNotice] = useState(''), [storageNotice, setStorageNotice] = useState('');
  const [candidate, setCandidate] = useState<RecoveryMetadata | null>(null), candidateRef = useRef<RecoveryMetadata | null>(null), [pendingVersion, setPendingVersion] = useState(0), [statusMissing, setStatusMissing] = useState(false), [freshDraft, setFreshDraft] = useState<DraftData | null>(null), [needsBaseline, setNeedsBaseline] = useState(false), [settledTarget, setSettledTarget] = useState<{ id: string; deleted: boolean; editable: boolean } | null>(null);
  const freshDraftRef = useRef<DraftData | null>(null);
  const publishFreshDraft = useCallback((value: DraftData | null) => { freshDraftRef.current = value; setFreshDraft(value); }, []);
  const [restricted, setRestricted] = useState(false), [followupAvailable, setFollowupAvailable] = useState(false);
  const privateMasked = useRef(false), textRevision = useRef(0);
  const leaving = useRef(false);
  const [exitError, setExitError] = useState('');
  const [picker, setPicker] = useState<null | { key: string; title: string; selected: string; items: { label: string; value: string }[]; choose(value: string): void; epoch: number; confirmValue?: string; onReturnFocus?: () => void }>(null), [focusedOption, setFocusedOption] = useState(''), [focusedField, setFocusedField] = useState('');
  const pickerCancel = useRef<View>(null), pickerOrigin = useRef<HTMLElement | null>(null), submitButton = useRef<View>(null);
  const [focusStamp, setFocusStamp] = useState(0), [focusState, setFocusState] = useState(false), [validation, setValidation] = useState<{ focus: number; foreground: number } | null>(null), [baselineState, setBaselineState] = useState(''), [pendingState, setPendingState] = useState<Pending | null>(null);
  const renderEpoch = focusStamp;
  const setBaseline = (value: string) => { baseline.current = value; setBaselineState(value); };
  const canAccount = useCallback(() => alive.current && isCurrentAccount(), [isCurrentAccount]);
  const canAct = (epoch = renderEpoch) => canAccount() && focused.current && verified.current && epoch === focusEpoch.current && verifiedForeground.current === foregroundGeneration() && isForeground();
  const visible = foreground && focusState && validation?.focus === focusStamp && validation.foreground === foregroundRevision && isCurrentAccount();
  const snapshot = formSnapshot(form, files), dirty = baselineState !== '' && snapshot !== baselineState;
  const template = options?.templates.find(item => item.id === form.templateId);
  const currentPending = pendingState;
  const locked = busy || !!currentPending || !!candidate || needsBaseline || !!settledTarget || !!picker;
  const publishForm = (next: Form) => { formRef.current = next; setForm(next); };
  const update = (next: Partial<Form>) => { if (!canAct() || privateMasked.current || busyRef.current || settledTarget) return; revision.current++; textRevision.current = revision.current; publishForm({ ...formRef.current, ...next }); setNotice(''); setErrors({}); setExitError(''); };
  const touchFiles = (next: PendingAttachment[]) => { revision.current++; filesRef.current = next; setFiles([...next]); setNotice(''); };
  const setCandidateBoth = (next: RecoveryMetadata | null) => { candidateRef.current = next; setCandidate(next); };
  const bumpPending = () => { setPendingState(pending.current ? { ...pending.current } : null); setPendingVersion(value => value + 1); };
  const makeRecord = (): RecoveryRecord | null => {
    const o = optionsRef.current, t = o?.templates.find(item => item.id === formRef.current.templateId);
    if (!actorId || !t || !initialized.current || privateMasked.current) return null;
    const base = { version: 1 as const, actorId, scope, revision: revision.current, savedAt: new Date().toISOString() };
    const attempt = pending.current;
    if (attempt && (attempt.hasNewUploads || !attempt.body)) return { ...base, mode: 'proof-only', pending: { requestId: attempt.requestId, intent: attempt.intent, revision: attempt.revision, expectedUpdatedAt: attempt.expectedUpdatedAt, stage: attempt.stage, hasNewUploads: attempt.hasNewUploads, replayable: false } };
    const text = recoveryText(t, { title: formRef.current.title, templateId: t.id, fieldValues: formRef.current.values, approverIds: formRef.current.approverIds });
    return { ...base, mode: 'full-text', templateFingerprint: templateFingerprint(t), baselineUpdatedAt: formRef.current.updatedAt, text, omittedAttachmentCount: filesRef.current.length, pending: attempt && attempt.body ? { requestId: attempt.requestId, intent: attempt.intent, revision: attempt.revision, expectedUpdatedAt: attempt.expectedUpdatedAt, stage: attempt.stage, hasNewUploads: false, replayable: true, templateFingerprint: attempt.fingerprint, text: { title: attempt.body.title, templateId: attempt.body.templateId, fieldValues: attempt.body.fieldValues, approverIds: attempt.body.approverIds } } : null };
  };
  const flush = async (): Promise<boolean> => {
    if (leaving.current || allowLeave.current) return false;
    if (!canAccount() || candidateRef.current || !storageReady) { if (canAccount() && !storageReady) setStorageNotice('작성 내용을 이 기기에 보관하지 못했습니다. 현재 입력은 유지됩니다.'); return false; }
    const record = makeRecord(); if (!record) return false;
    try { const saved = await checkpoint(record); if (canAccount() && saved.revision === revision.current && isForeground()) setStorageNotice(saved.mode === 'proof-only' ? '요청 결과 확인 정보만 보관했습니다. 작성 내용과 첨부파일은 보관되지 않았습니다.' : durable ? '작성 내용을 이 기기에 보관했습니다. 첨부파일은 다시 선택해야 합니다.' : '작성 내용을 현재 화면에만 보관합니다. 앱을 닫으면 복구할 수 없습니다.'); return true; }
    catch (cause) { if (canAccount() && !(cause instanceof Error && cause.name === 'AbortError')) setStorageNotice(message(cause, '기기 보관에 실패했습니다. 현재 입력은 유지됩니다.')); return false; }
  };
  useEffect(() => { checkpointRef.current = flush; });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; focused.current = false; verified.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadSequence.current++; };
  }, []);
  const load = useCallback(async (epoch: number) => {
    if (!canAccount() || !isForeground() || !focused.current) return;
    const sequence = ++loadSequence.current, foregroundAtStart = foregroundGeneration(), discoverMetadata = !initialized.current;
    const current = () => canAccount() && focused.current && epoch === focusEpoch.current && sequence === loadSequence.current && foregroundAtStart === foregroundGeneration() && isForeground();
    verified.current = false; setValidation(null); publishFreshDraft(null); setLoading(true); setLoadError('');
    try {
      const rawOptions = await request<unknown>('/drafts/options');
      if (!current()) return;
      if (!isDraftOptions(rawOptions)) throw new ApiError('작성 화면 응답을 확인하지 못했습니다.', 200);
      const o = rawOptions;
      optionsRef.current = o; setOptions(o);
      let rawDraft: { draft: unknown } | null = null;
      try { rawDraft = documentId ? await request<{ draft: unknown }>('/drafts/' + documentId) : null; }
      catch (cause) {
        if (!(cause instanceof ApiError) || ![403, 404].includes(cause.status)) throw cause;
        if (!current()) return;
        formRef.current = emptyForm(); setForm(emptyForm()); filesRef.current = []; setFiles([]); setBaseline(''); publishFreshDraft(null); privateMasked.current = true; setRestricted(true); initialized.current = false;
        if (pending.current) { pending.current.body = null; pending.current.fingerprint = ''; bumpPending(); }
        let metadata: RecoveryMetadata | null = null;
        try { metadata = await restrictScope(scope); }
        catch { if (current()) setStorageNotice('원 요청 확인 정보의 기기 보관을 확인하지 못했습니다.'); }
        if (!current()) return;
        if (metadata) { setCandidateBoth(metadata); revision.current = Math.max(revision.current, metadata.revision); }
        else { setCandidateBoth(null); if (pending.current && actorId) { const original = pending.current; void checkpoint({ version: 1, actorId, scope, revision: Math.max(revision.current, original.revision), savedAt: new Date().toISOString(), mode: 'proof-only', pending: { requestId: original.requestId, intent: original.intent, revision: original.revision, expectedUpdatedAt: original.expectedUpdatedAt, stage: 'unknown', hasNewUploads: original.hasNewUploads, replayable: false } }).catch(() => undefined); } }
        verified.current = true; verifiedForeground.current = foregroundAtStart; setValidation({ focus: epoch, foreground: foregroundAtStart }); setNotice('이 문서는 현재 수정할 수 없습니다. 원 요청의 결과 확인만 가능합니다.'); return;
      }
      if (!current()) return;
      if (rawDraft && !isDraftData(rawDraft.draft, documentId)) throw new ApiError('작성 화면 응답을 확인하지 못했습니다.', 200);
      privateMasked.current = false; setRestricted(false);
      const d = rawDraft?.draft as DraftData | undefined;
      optionsRef.current = o; setOptions(o); publishFreshDraft(d ?? null);
      if (!initialized.current || formSnapshot(formRef.current, filesRef.current) === baseline.current && !pending.current) {
        const t = o.templates.find(item => item.id === d?.templateId) ?? (!d ? o.templates[0] : undefined);
        const next: Form = { title: d?.title === '제목 없는 기안' ? '' : d?.title ?? '', templateId: d?.templateId ?? t?.id ?? '', values: d?.fieldValues ?? t?.initialValues ?? {}, approverIds: d?.approverIds ?? (o.approvers.length === 1 ? [o.approvers[0].id] : []), attachments: d?.attachments ?? [], updatedAt: d?.updatedAt ?? null };
        formRef.current = next; setForm(next); filesRef.current = []; setFiles([]); setBaseline(formSnapshot(next, [])); initialized.current = true; textRevision.current = 0; setNeedsBaseline(false);
      } else if (d && d.updatedAt !== formRef.current.updatedAt) setNeedsBaseline(true);
      verified.current = true; verifiedForeground.current = foregroundAtStart; setValidation({ focus: epoch, foreground: foregroundAtStart });
      if (discoverMetadata && !candidateRef.current && !pending.current) {
        try { const metadata = (await listMetadata()).find(item => recoveryScopeKey(item.scope) === recoveryScopeKey(scope)); if (current() && metadata) { candidateRef.current = metadata; setCandidate(metadata); revision.current = Math.max(revision.current, metadata.revision); } }
        catch (cause) { if (current() && !(cause instanceof Error && cause.name === 'AbortError')) setStorageNotice('기기 보관 내용을 확인하지 못했습니다. 현재 화면의 입력은 유지됩니다.'); }
      }
    } catch (cause) {
      if (!current()) return;
      verified.current = false; setValidation(null);
      if (cause instanceof ApiError && [403, 404].includes(cause.status)) {
        formRef.current = emptyForm(); setForm(emptyForm()); filesRef.current = []; setFiles([]); setBaseline(''); optionsRef.current = null; setOptions(null); publishFreshDraft(null); initialized.current = false;
        if (pending.current) { pending.current.body = null; pending.current.fingerprint = ''; bumpPending(); }
        candidateRef.current = null; setCandidate(null);
        void purgeScope(scope).then(() => { const original = pending.current; if (!original || !actorId || !canAccount()) return; return checkpoint({ version: 1, actorId, scope, revision: Math.max(revision.current, original.revision), savedAt: new Date().toISOString(), mode: 'proof-only', pending: { requestId: original.requestId, intent: original.intent, revision: original.revision, expectedUpdatedAt: original.expectedUpdatedAt, stage: 'unknown', hasNewUploads: original.hasNewUploads, replayable: false } }); }).catch(() => undefined);
      }
      setLoadError(message(cause, '작성 화면을 확인하지 못했습니다.'));
    } finally { if (current()) setLoading(false); }
  }, [canAccount, isForeground, foregroundGeneration, request, documentId, scope, listMetadata, restrictScope, purgeScope, checkpoint, actorId, publishFreshDraft]);
  useFocusEffect(useCallback(() => {
    void foregroundRevision; void bindingRevision;
    focused.current = true; setFocusState(true); const epoch = ++focusEpoch.current; setFocusStamp(epoch); verified.current = false; setValidation(null); setLoading(true); setPicker(null);
    if (isForeground()) void load(epoch);
    return () => { focused.current = false; setFocusState(false); verified.current = false; setValidation(null); loadSequence.current++; setPicker(null); cancelConfirmation(); };
  }, [load, foregroundRevision, bindingRevision, isForeground, cancelConfirmation]));
  useEffect(() => {
    if (!visible || !dirty && !currentPending || candidate || busy) return;
    const timer = setTimeout(() => { void checkpointRef.current?.(); }, 800);
    return () => clearTimeout(timer);
  }, [snapshot, pendingVersion, visible, dirty, candidate, busy, currentPending]);
  const confirmed = async (title: string, text: string, action: string, danger = false) => {
    const epoch = focusEpoch.current;
    if (!canAct(epoch) || busyRef.current) return false;
    const accepted = await confirmation.ask({ title, message: text, confirm: action, danger });
    return accepted && canAct(epoch) && !busyRef.current;
  };
  usePreventRemove((dirty || !!currentPending || busy) && !!actorId, ({ data }) => {
    if (allowLeave.current) { navigation.dispatch(data.action); return; }
    const epoch = focusEpoch.current, foregroundAtStart = foregroundGeneration();
    const canLeave = () => canAccount() && focused.current && epoch === focusEpoch.current && foregroundAtStart === foregroundGeneration() && isForeground();
    if (!canLeave() || busyRef.current) return;
    const keepDescription = currentPending && (currentPending.hasNewUploads || !currentPending.body) ? '원 요청의 결과 확인 정보만 보관됩니다. 작성 내용과 첨부파일은 보관되지 않습니다.' : durable ? '보관하면 입력한 텍스트를 작성 복구에서 이어 쓸 수 있습니다. 첨부파일은 다시 선택해야 합니다.' : '텍스트는 이번 앱 실행 중에만 보관됩니다. 앱을 완전히 닫으면 복구할 수 없으며 첨부파일은 다시 선택해야 합니다.';
    void confirmation.choose({ title: '작성 화면 나가기', message: keepDescription + ' 저장하지 않고 나가면 이 작성 내용의 기기 보관본도 지워집니다. 서버에 임시저장한 기안은 유지됩니다.' + (currentPending ? ' 결과를 확인하지 못한 원 요청 정보도 지워지며, 이미 서버에서 처리된 요청은 취소되지 않습니다.' : ''), confirm: '보관하고 나가기', alternative: '저장하지 않고 나가기' }).then(async choice => {
      if (choice === 'cancel' || !canLeave() || busyRef.current) return;
      busyRef.current = true; setBusy(true); setError(''); setExitError(''); setProgress(choice === 'alternative' ? '기기 보관본을 지우고 있습니다…' : '작성 내용을 보관하고 있습니다…');
      try {
        if (choice === 'alternative') {
          // Stop delayed checkpoints before reading the exact stored revision.
          // discard also invalidates writes already queued for this scope.
          leaving.current = true;
          const stored = (await listMetadata()).find(item => recoveryScopeKey(item.scope) === recoveryScopeKey(scope));
          if (!canLeave()) return;
          if (stored && (stored.revision > revision.current || !await discard(scope, stored.revision))) throw new Error('더 최근의 보관 내용이 있어 삭제하지 않았습니다. 작성 복구에서 확인하세요.');
        } else {
          const saved = await checkpointRef.current?.();
          if (!canLeave()) return;
          if (!saved) throw new Error('기기에 보관하지 못했습니다. 입력은 유지됩니다. 뒤로 가기를 눌러 다시 선택하세요.');
        }
        if (!canLeave()) return;
        allowLeave.current = true; navigation.dispatch(data.action);
      } catch (cause) { if (canLeave()) setExitError(message(cause, '나가기를 완료하지 못했습니다. 현재 입력은 유지됩니다.')); }
      finally { leaving.current = false; busyRef.current = false; if (canAccount()) { setBusy(false); setProgress(''); } }
    });
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty && !currentPending) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, currentPending]);
  const closePicker = useCallback(() => {
    setPicker(null);
    if (!picker || !canAccount() || !focused.current || !verified.current || picker.epoch !== focusEpoch.current || verifiedForeground.current !== foregroundGeneration() || !isForeground()) return;
    if (Platform.OS === 'android') picker.onReturnFocus?.();
    else if (pickerOrigin.current?.isConnected) pickerOrigin.current.focus();
  }, [picker, canAccount, foregroundGeneration, isForeground]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !picker) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setPicker(null); pickerOrigin.current?.focus(); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [picker]);
  useEffect(() => {
    if (Platform.OS !== 'android' || !picker || !visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { closePicker(); return true; });
    return () => subscription.remove();
  }, [picker, visible, closePicker]);
  const showPicker = (key: string, name: string, selected: string, items: { label: string; value: string }[], choose: (value: string) => void, onReturnFocus?: () => void) => {
    if (!canAct() || privateMasked.current || busyRef.current || settledTarget) return;
    if (Platform.OS === 'android' && picker?.key === key) { closePicker(); return; }
    if (Platform.OS === 'web' && typeof document !== 'undefined') pickerOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (Platform.OS === 'android') Keyboard.dismiss();
    setPicker({ key, title: name, selected, items, choose, epoch: focusEpoch.current, onReturnFocus });
  };
  const choosePicker = (value: string) => {
    if (!picker || !canAct(picker.epoch) || busyRef.current || settledTarget) return;
    if (Platform.OS === 'android' && picker.key === 'template' && baseline.current !== '' && formSnapshot(formRef.current, filesRef.current) !== baseline.current && value !== formRef.current.templateId) {
      setPicker({ ...picker, confirmValue: value }); return;
    }
    picker.choose(value); closePicker();
  };
  const applyTemplate = (id: string) => {
    if (!canAct() || privateMasked.current || id === formRef.current.templateId) return;
    const t = optionsRef.current?.templates.find(item => item.id === id); if (!t) return;
    update({ templateId: id, values: { ...t.initialValues } });
  };
  const changeTemplate = async (id: string) => {
    if (!canAct() || privateMasked.current || id === formRef.current.templateId) return;
    const t = optionsRef.current?.templates.find(item => item.id === id); if (!t) return;
    if (dirty && !await confirmed('양식 변경', '현재 양식의 입력 내용이 초기화됩니다. 양식을 바꾸시겠습니까?', '변경', true)) return;
    applyTemplate(id);
  };
  const addFiles = async () => {
    if (!canAct() || privateMasked.current || locked || !optionsRef.current) return;
    const epoch = focusEpoch.current, foregroundAtStart = foregroundGeneration(), o = optionsRef.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*', base64: false });
      if (!canAct(epoch) || foregroundAtStart !== foregroundGeneration() || result.canceled) return;
      if (formRef.current.attachments.length + filesRef.current.length + result.assets.length > o.attachmentPolicy.maxFileCount) throw new Error('첨부파일은 ' + o.attachmentPolicy.maxFileCount + '개까지 등록할 수 있습니다.');
      for (const file of result.assets) { const invalid = attachmentError(file, o.attachmentPolicy); if (invalid) throw new Error(invalid); }
      touchFiles([...filesRef.current, ...result.assets.map(file => ({ ...file, key: requestKey() }))]); setError('');
    } catch (cause) { if (canAct(epoch)) setError(message(cause, '파일을 선택하지 못했습니다.')); }
  };
  const removePending = (file: PendingAttachment) => {
    if (!canAct() || privateMasked.current || locked || !filesRef.current.some(item => item.key === file.key)) return;
    touchFiles(filesRef.current.filter(item => item.key !== file.key));
    if (file.uploadId) void request('/drafts/uploads/' + file.uploadId, { method: 'DELETE' }).catch(() => undefined);
  };
  const removeExisting = async (file: DraftAttachment) => {
    const epoch = focusEpoch.current;
    if (!documentId || !canAct(epoch) || privateMasked.current || locked || !await confirmed('첨부파일 삭제', '"' + file.name + '" 파일을 문서에서 삭제합니다. 삭제 후 되돌릴 수 없습니다.', '삭제', true) || !canAct(epoch)) return;
    busyRef.current = true; setBusy(true); setError('');
    try { const result = await request<{ draft: unknown }>('/drafts/' + documentId + '/attachments/' + file.id, { method: 'DELETE' }); if (!canAct(epoch)) return; if (!isDraftData(result.draft, documentId)) throw new ApiError('삭제 응답을 확인하지 못했습니다. 최신 문서를 확인하세요.', 200); publishForm({ ...formRef.current, attachments: result.draft.attachments, updatedAt: result.draft.updatedAt }); revision.current++; setNotice('첨부파일을 삭제했습니다.'); }
    catch (cause) { if (canAct(epoch)) { if (cause instanceof ApiError && [403, 404].includes(cause.status)) { verified.current = false; setValidation(null); publishForm(emptyForm()); filesRef.current = []; setFiles([]); setLoadError('이 문서의 열람 권한을 확인할 수 없습니다.'); void purgeScope(scope).catch(() => undefined); } setError(message(cause, '파일 삭제 결과를 확인하지 못했습니다. 최신 문서를 확인하세요.')); setNeedsBaseline(true); } }
    finally { busyRef.current = false; if (canAccount()) setBusy(false); }
  };
  const restore = async () => {
    const epoch = focusEpoch.current, metadata = candidateRef.current;
    if (!metadata || !canAct(epoch) || busyRef.current) return;
    try {
      const record = await loadForExplicitRestore(scope); if (!canAct(epoch) || !record || record.revision !== metadata.revision) throw new Error('보관 내용이 변경되었습니다. 다시 확인하세요.');
      const o = optionsRef.current; if (!o) return;
      if (record.mode === 'full-text') {
        const t = o.templates.find(item => item.id === record.text.templateId);
        const pt = record.pending ? o.templates.find(item => item.id === record.pending!.text.templateId) : null;
        const compatible = !restricted && !!t && templateFingerprint(t) === record.templateFingerprint && compatibleRecoveryText(t, record.text, o) && (!record.pending || !!pt && templateFingerprint(pt) === record.pending.templateFingerprint && compatibleRecoveryText(pt, record.pending.text, o));
        if (!compatible) {
          if (!record.pending) throw new Error('양식 또는 결재자가 변경되어 보관 입력을 그대로 적용할 수 없습니다. 원 입력은 기기에 보관한 채 유지합니다.');
          const p = record.pending;
          pending.current = { requestId: p.requestId, intent: p.intent, revision: p.revision, expectedUpdatedAt: p.expectedUpdatedAt, stage: p.stage, hasNewUploads: p.hasNewUploads, fingerprint: '', body: null };
          revision.current = Math.max(revision.current, record.revision); setStatusMissing(false); bumpPending(); setError('양식 또는 결재자가 달라져 텍스트를 적용하지 않았습니다. 원 요청의 결과 확인만 가능합니다.'); return;
        }
        const changedBaseline = record.baselineUpdatedAt !== formRef.current.updatedAt;
        if (!await confirmed('보관 입력 복원', changedBaseline && !record.pending ? '서버의 문서가 변경되었습니다. 보관 입력을 현재 서버 기준에 적용하시겠습니까?' : '현재 입력을 보관한 내용으로 교체합니다. 첨부파일은 다시 선택해야 합니다.', changedBaseline && !record.pending ? '최신 기준에 적용' : '복원')) return;
        if (!canAct(epoch)) return;
        const base = record.pending ? record.baselineUpdatedAt : formRef.current.updatedAt;
        textRevision.current = record.revision;
        publishForm({ ...formRef.current, title: record.text.title, templateId: record.text.templateId, values: { ...record.text.fieldValues }, approverIds: [...record.text.approverIds], updatedAt: base }); filesRef.current = []; setFiles([]);
        if (record.pending) { const p = record.pending; pending.current = { requestId: p.requestId, intent: p.intent, revision: p.revision, expectedUpdatedAt: p.expectedUpdatedAt, stage: p.stage, hasNewUploads: false, fingerprint: p.templateFingerprint, body: { ...p.text, uploadIds: [], intent: p.intent, expectedUpdatedAt: p.expectedUpdatedAt, requestId: p.requestId } }; } else pending.current = null;
        setNeedsBaseline(!!record.pending && changedBaseline); setNotice(record.omittedAttachmentCount ? '보관 입력을 복원했습니다. 첨부파일을 다시 선택하세요.' : '보관 입력을 복원했습니다.');
      } else { const p = record.pending; pending.current = { requestId: p.requestId, intent: p.intent, revision: p.revision, expectedUpdatedAt: p.expectedUpdatedAt, stage: p.stage, hasNewUploads: p.hasNewUploads, fingerprint: '', body: null }; setNotice('작성 내용은 보관되지 않았습니다. 원 요청의 결과만 확인할 수 있습니다.'); }
      revision.current = Math.max(revision.current, record.revision); setCandidateBoth(null); setErrors({}); setError(''); setStatusMissing(false); bumpPending();
    } catch (cause) { if (canAct(epoch)) setError(message(cause, '보관 입력을 복원하지 못했습니다.')); }
  };
  const discardCandidate = async () => {
    const metadata = candidateRef.current, epoch = focusEpoch.current;
    if (!metadata || !canAct(epoch) || !await confirmed('기기 보관 내용 버리기', metadata.pending ? '보관한 원 요청의 결과 확인 정보도 버립니다. 이미 처리된 요청은 취소되지 않습니다. 버리시겠습니까?' : '이 기기에 보관한 작성 내용을 삭제합니다. 현재 화면의 입력은 유지됩니다.', '버리기', true)) return;
    if (!canAct(epoch) || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { if (!await discard(scope, metadata.revision)) throw new Error('더 최근의 보관 내용이 있어 삭제하지 않았습니다.'); if (canAct(epoch)) { setCandidateBoth(null); setStorageNotice('기기 보관 내용을 버렸습니다.'); } } catch (cause) { if (canAct(epoch)) setError(message(cause, '기기 보관 내용 삭제를 확인하지 못했습니다.')); }
    finally { busyRef.current = false; if (canAccount()) setBusy(false); }
  };
  const adoptBaseline = async (replace: boolean) => {
    const d = freshDraftRef.current, epoch = focusEpoch.current;
    if (!d || pending.current || !canAct(epoch) || !await confirmed(replace ? '서버 내용으로 교체' : '최신 기준 적용', replace ? '현재 입력을 최신 서버 내용으로 교체합니다. 새로 선택한 첨부파일은 제거됩니다.' : '현재 입력을 유지하고 최신 수정 기준을 적용합니다. 이후 저장 버튼을 눌러야 반영됩니다.', replace ? '교체' : '적용', replace)) return;
    if (!canAct(epoch) || freshDraftRef.current !== d) return;
    if (replace) { publishForm({ title: d.title === '제목 없는 기안' ? '' : d.title, templateId: d.templateId, values: d.fieldValues, approverIds: d.approverIds, attachments: d.attachments, updatedAt: d.updatedAt }); filesRef.current = []; setFiles([]); setBaseline(formSnapshot(formRef.current, [])); }
    else publishForm({ ...formRef.current, attachments: d.attachments, updatedAt: d.updatedAt });
    revision.current++; setNeedsBaseline(false); setSettledTarget(null); setErrors({}); setError(''); setNotice('최신 기준을 적용했습니다. 저장 여부를 직접 선택하세요.');
  };
  const acceptCommit = async (proof: DraftCommitProof, result: { status?: string; current?: DraftRequestStatus['current']; outcome?: 'present' | 'deleted' }, original: Pending, epoch: number) => {
    if (!canAct(epoch) || pending.current !== original || !matchesDraftProof(proof, original, scope)) throw recoveryAbort();
    const deleted = result.outcome === 'deleted';
    const editable = result.current?.editable ?? ['draft', 'recalled'].includes(result.status ?? '');
    const hasFollowup = initialized.current && !privateMasked.current && textRevision.current > original.revision;
    const retainedCandidate = candidateRef.current?.mode === 'full-text' && !original.body;
    let refreshed: DraftData | null = null;
    let refreshFailed = false;
    setStatusMissing(false); setErrors({}); setError('');
    if (!deleted && editable && documentId) {
      try {
        const response = await request<{ draft: unknown }>('/drafts/' + documentId);
        if (!canAct(epoch)) return;
        if (!isDraftData(response.draft, documentId)) throw new ApiError('최신 문서 응답을 확인하지 못했습니다.', 200);
        refreshed = response.draft;
      } catch (cause) {
        if (!canAct(epoch)) return;
        if (cause instanceof ApiError && [403, 404].includes(cause.status)) {
          // Keep RAM input intact, but never render, checkpoint, or resend it
          // after the current document permission check fails.
          privateMasked.current = true; setRestricted(true); publishFreshDraft(null); setPicker(null);
          setFollowupAvailable(false); setSettledTarget({ id: proof.documentId, deleted: false, editable: false });
          pending.current = null; bumpPending();
          setNotice('원 요청의 저장은 확인했습니다. 현재 문서 권한을 확인할 수 없어 입력과 첨부 정보를 숨겼습니다.');
          return;
        }
        publishFreshDraft(null); refreshFailed = true;
      }
    }
    if (hasFollowup) {
      original.stage = 'unknown';
      setSettledTarget({ id: proof.documentId, deleted, editable }); setFollowupAvailable(true);
      setNotice(deleted ? '원 요청은 처리된 뒤 삭제되었습니다. 이후 입력은 남겨두었습니다.' : '원 요청은 저장됐습니다. 이후 입력은 남겨두었습니다. 결과 문서를 확인하세요.');
      await flush(); bumpPending(); return;
    }
    pending.current = null; bumpPending(); setFollowupAvailable(false);
    if (retainedCandidate) {
      setSettledTarget({ id: proof.documentId, deleted, editable });
      setNotice('원 요청의 처리를 확인했습니다. 적용하지 않은 보관 입력은 그대로 남겨두었습니다.');
      return;
    }
    setCandidateBoth(null); filesRef.current = []; setFiles([]);
    let cleared = true;
    try { cleared = await discard(scope, revision.current); } catch { cleared = false; }
    if (!canAct(epoch)) return;
    if (!cleared) setStorageNotice('저장은 완료됐지만 기기 보관 내용 정리를 확인하지 못했습니다. 다음에 원 요청의 결과를 확인하세요.');
    if (deleted) { setSettledTarget({ id: proof.documentId, deleted: true, editable: false }); setNotice('원 요청은 처리된 뒤 삭제되었습니다. 다시 등록하지 않습니다.'); return; }
    setNotice(original.intent === 'submit' ? '상신했습니다.' : '임시저장했습니다.');
    if (original.intent === 'submit' || !editable) { allowLeave.current = true; router.replace('/documents/' + proof.documentId); return; }
    if (!documentId) { allowLeave.current = true; router.replace('/drafts/' + proof.documentId); return; }
    publishForm({ ...formRef.current, attachments: refreshed?.attachments ?? formRef.current.attachments, updatedAt: refreshed?.updatedAt ?? proof.committedUpdatedAt });
    setBaseline(formSnapshot(formRef.current, []));
    if (refreshed) { publishFreshDraft(refreshed); setNeedsBaseline(false); }
    if (refreshFailed) { setError('저장은 완료됐지만 최신 문서 조회에 실패했습니다. 입력은 유지됩니다. 최신 내용을 확인하세요.'); setNeedsBaseline(true); }
  };
  const sendOriginal = async (original: Pending, epoch: number) => {
    if (!canAct(epoch) || privateMasked.current || pending.current !== original || !original.body) throw recoveryAbort();
    original.stage = 'sent'; bumpPending(); await flush(); if (!canAct(epoch)) throw recoveryAbort();
    const result = await request<unknown>(documentId ? '/drafts/' + documentId : '/drafts', { method: 'POST', body: original.body });
    if (!canAct(epoch)) throw recoveryAbort();
    if (!isDraftSaveResult(result) || documentId && result.documentId !== documentId || result.proof && !matchesDraftProof(result.proof, original, scope)) throw new ApiError('저장 응답을 확인하지 못했습니다. 원 요청의 결과를 확인하세요.', 200);
    if (!result.proof) { original.stage = 'unknown'; setNotice('저장 응답은 받았지만 원 요청의 확정 증거가 없습니다. 결과를 확인하세요.'); await flush(); bumpPending(); return; }
    await acceptCommit(result.proof, { status: result.status }, original, epoch);
  };
  const resolvePending = async (retry = false) => {
    const original = pending.current, epoch = focusEpoch.current;
    if (!original || !canAct(epoch) || busyRef.current || settledTarget) return;
    busyRef.current = true; setBusy(true); setError(''); setProgress('원 요청 결과 확인 중');
    try {
      let result: unknown;
      try { result = await request('/drafts/requests/' + original.requestId + (documentId ? '?documentId=' + encodeURIComponent(documentId) : '')); }
      catch (cause) {
        if (cause instanceof ApiError && cause.status === 404 && cause.code === 'NOT_FOUND') {
          if (!canAct(epoch)) return; setStatusMissing(true);
          if (!retry || !original.body || original.hasNewUploads) { setNotice('원 요청의 처리 증거를 아직 확인하지 못했습니다.' + (!original.body ? ' 이 보관 기록은 결과 확인만 가능합니다.' : ' 원문을 가진 요청만 같은 키로 직접 재시도할 수 있습니다.')); return; }
          const t = optionsRef.current?.templates.find(item => item.id === original.body!.templateId);
          if (!t || !optionsRef.current || templateFingerprint(t) !== original.fingerprint || !compatibleRecoveryText(t, original.body, optionsRef.current)) throw new Error('원 요청의 양식 또는 결재자가 달라졌습니다. 결과 확인만 가능합니다.');
          setProgress('같은 요청 재시도 중'); await sendOriginal(original, epoch); return;
        }
        throw cause;
      }
      if (!canAct(epoch)) return;
      if (!isDraftRequestStatus(result) || !matchesDraftProof(result, original, scope)) throw new ApiError('원 요청의 결과 응답을 확인하지 못했습니다.', 200);
      await acceptCommit(result, result, original, epoch);
    } catch (cause) { if (pending.current === original) { original.stage = 'unknown'; bumpPending(); void flush(); } if (canAct(epoch)) setError(message(cause, '원 요청 결과를 확인하지 못했습니다.')); }
    finally { busyRef.current = false; if (canAccount()) { setBusy(false); setProgress(''); } }
  };
  const save = async (intent: 'draft' | 'submit') => {
    const epoch = focusEpoch.current;
    if (!canAct(epoch) || privateMasked.current || busyRef.current || pending.current || candidateRef.current || needsBaseline || settledTarget) return;
    const current = formRef.current, t = optionsRef.current?.templates.find(item => item.id === current.templateId);
    const invalid: Record<string, string> = {};
    if (!t) invalid.templateId = '사용 가능한 양식을 선택하세요.';
    if (intent === 'submit' && current.title.trim().length < 2) invalid.title = '제목은 2자 이상 입력하세요.';
    if (intent === 'submit' && current.approverIds.length !== 1) invalid.approvers = '시설장 1명을 결재자로 지정하세요.';
    if (!t || Object.keys(invalid).length) { setErrors(invalid); setError(Object.values(invalid)[0]); return; }
    if (!optionsRef.current || !compatibleRecoveryText(t, { title: current.title, templateId: current.templateId, fieldValues: current.values, approverIds: current.approverIds }, optionsRef.current)) { setError('양식 입력 또는 결재자를 다시 확인하세요.'); return; }
    busyRef.current = true; setBusy(true); setErrors({}); setError(''); setNotice('');
    let original: Pending | null = null;
    try {
      const selected = [...filesRef.current];
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i]; if (!canAct(epoch) || !filesRef.current.some(item => item.key === file.key)) throw recoveryAbort(); if (file.completed) continue;
        setProgress('첨부파일 업로드 ' + (i + 1) + '/' + selected.length);
        if (file.uploadId && !file.uploaded) { await request('/drafts/uploads/' + file.uploadId + '/complete', { method: 'POST' }); if (!canAct(epoch)) throw recoveryAbort(); file.completed = true; continue; }
        if (!file.uploadId) { const signed = await request<{ uploadId: string; uploadUrl: string; mimeType: string }>('/drafts/uploads', { method: 'POST', body: { name: file.name, size: file.size, mimeType: file.mimeType } }); if (!canAct(epoch)) throw recoveryAbort(); if (!draftId(signed.uploadId) || typeof signed.uploadUrl !== 'string' || !/^https?:\/\//.test(signed.uploadUrl) || typeof signed.mimeType !== 'string') throw new ApiError('파일 업로드 응답을 확인하지 못했습니다.', 200); file.uploadId = signed.uploadId; file.uploadUrl = signed.uploadUrl; }
        if (!file.uploaded) { await uploadFile(file, file.uploadUrl!, file.mimeType || 'application/octet-stream'); if (!canAct(epoch)) throw recoveryAbort(); file.uploaded = true; }
        await request('/drafts/uploads/' + file.uploadId + '/complete', { method: 'POST' }); if (!canAct(epoch)) throw recoveryAbort(); file.completed = true; setFiles([...filesRef.current]);
      }
      if (!canAct(epoch)) throw recoveryAbort();
      const text = canonicalDraftText({ title: current.title, templateId: current.templateId, fieldValues: current.values, approverIds: current.approverIds });
      const key = requestKey(); original = { requestId: key, intent, revision: revision.current, expectedUpdatedAt: current.updatedAt, stage: 'prepared', hasNewUploads: selected.length > 0, fingerprint: templateFingerprint(t), body: { ...text, uploadIds: selected.map(file => file.uploadId!), intent, expectedUpdatedAt: current.updatedAt, requestId: key } };
      if (!draftRequestId(key)) throw new Error('저장 요청 정보를 생성하지 못했습니다.');
      pending.current = original; bumpPending(); setProgress(intent === 'submit' ? '상신 중' : '저장 중'); await sendOriginal(original, epoch);
    } catch (cause) {
      if (original && pending.current === original) { if (unknown(cause)) { original.stage = 'unknown'; bumpPending(); void flush(); } else { pending.current = null; bumpPending(); if (cause instanceof ApiError && cause.status === 409) { publishFreshDraft(null); setNeedsBaseline(true); } void flush(); } }
      if (canAct(epoch)) { if (cause instanceof ApiError && [403, 404].includes(cause.status)) { verified.current = false; setValidation(null); publishForm(emptyForm()); filesRef.current = []; setFiles([]); optionsRef.current = null; setOptions(null); publishFreshDraft(null); setLoadError('이 문서의 작성 권한을 확인할 수 없습니다.'); void purgeScope(scope).catch(() => undefined); } else if (cause instanceof ApiError && cause.fields) setErrors(cause.fields); setError(message(cause, '저장하지 못했습니다. 입력은 유지됩니다.')); }
    } finally { busyRef.current = false; if (canAccount()) { setBusy(false); setProgress(''); } }
  };
  const continueFollowup = async () => {
    const target = settledTarget, original = pending.current, epoch = focusEpoch.current;
    if (!target || !original || !followupAvailable || privateMasked.current || !canAct(epoch) || busyRef.current) return;
    const editable = !target.deleted && target.editable;
    if (!await confirmed(editable ? '후속 입력으로 계속 작성' : '후속 입력으로 새 기안 작성', editable ? '확정된 원 요청은 다시 보내지 않습니다. 이후 작성한 입력을 결과 기안의 최신 기준에 적용합니다. 첨부파일은 다시 선택해야 합니다.' : '원 요청은 이미 처리됐습니다. 이후 작성한 입력을 별도의 새 기안 범위에 보관합니다. 기존 요청과 문서는 변경하지 않습니다.', editable ? '계속 작성' : '새 기안 작성') || !canAct(epoch)) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const o = await request<unknown>('/drafts/options');
      if (!canAct(epoch)) return;
      if (!isDraftOptions(o)) throw new ApiError('최신 양식을 확인하지 못했습니다.', 200);
      let d: DraftData | null = null;
      if (editable) { const response = await request<{ draft: unknown }>('/drafts/' + target.id); if (!canAct(epoch)) return; if (!isDraftData(response.draft, target.id)) throw new ApiError('결과 기안의 수정 권한을 확인하지 못했습니다.', 200); d = response.draft; }
      const t = o.templates.find(item => item.id === formRef.current.templateId);
      const text = { title: formRef.current.title, templateId: formRef.current.templateId, fieldValues: formRef.current.values, approverIds: formRef.current.approverIds };
      if (!t || !compatibleRecoveryText(t, text, o)) throw new Error('후속 입력의 양식 또는 결재자를 확인하세요. 현재 입력은 유지됩니다.');
      const destination: RecoveryScope = d ? { kind: 'document', documentId: d.id } : { kind: 'new', localId: requestKey() };
      const sameScope = recoveryScopeKey(destination) === recoveryScopeKey(scope);
      if (!sameScope && (await listMetadata()).some(item => recoveryScopeKey(item.scope) === recoveryScopeKey(destination))) throw new Error('결과 기안에 다른 보관 입력이 있습니다. 작성 복구에서 확인하세요. 현재 입력은 유지됩니다.');
      if (!canAct(epoch) || !actorId) return;
      const sourceRevision = revision.current;
      const next: RecoveryRecord = { version: 1, actorId, scope: destination, revision: sourceRevision + 1, savedAt: new Date().toISOString(), mode: 'full-text', templateFingerprint: templateFingerprint(t), baselineUpdatedAt: d?.updatedAt ?? null, text: recoveryText(t, text), omittedAttachmentCount: filesRef.current.length, pending: null };
      const saved = await checkpoint(next);
      const verifiedRecord = await loadForExplicitRestore(destination);
      if (!canAct(epoch)) return;
      if (saved.mode !== 'full-text' || !verifiedRecord || JSON.stringify(saved) !== JSON.stringify(verifiedRecord)) throw new Error('후속 입력의 보관을 확인하지 못했습니다. 원 입력은 유지됩니다.');
      if (sameScope && d) {
        revision.current = next.revision; pending.current = null; bumpPending(); setCandidateBoth(null); setSettledTarget(null); setFollowupAvailable(false); setNeedsBaseline(false); optionsRef.current = o; setOptions(o); publishFreshDraft(d); publishForm({ ...formRef.current, attachments: d.attachments, updatedAt: d.updatedAt }); filesRef.current = []; setFiles([]); setNotice('후속 입력에 최신 기준을 적용했습니다. 저장 여부를 직접 선택하세요.'); return;
      }
      try { await discard(scope, sourceRevision); } catch { setStorageNotice('후속 입력은 보관했습니다. 원 범위의 기기 기록 정리는 확인하지 못했습니다.'); }
      if (!canAct(epoch)) return;
      allowLeave.current = true;
      if (destination.kind === 'new') router.replace({ pathname: '/drafts/new', params: { scopeId: destination.localId } });
      else router.replace('/drafts/' + destination.documentId);
    } catch (cause) { if (canAct(epoch)) setError(message(cause, '후속 입력을 이동하지 못했습니다. 원 입력은 유지됩니다.')); }
    finally { busyRef.current = false; if (canAccount()) setBusy(false); }
  };
  const openRecovery = async () => {
    const epoch = focusEpoch.current, foregroundAtStart = foregroundGeneration();
    if (!canAct(epoch) || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      if (!privateMasked.current && !candidateRef.current && (formSnapshot(formRef.current, filesRef.current) !== baseline.current || pending.current)) await flush();
      if (canAct(epoch) && foregroundAtStart === foregroundGeneration()) router.push('/drafts/recovery');
    } finally { busyRef.current = false; if (canAccount()) setBusy(false); }
  };
  if (!visible) return <View style={[styles.loading, { backgroundColor: theme.background }]}>{loading || !foreground ? <><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.secondary }}>{!foreground ? '작성 내용을 보호하고 있습니다.' : '작성 화면 확인 중'}</Text></> : <ErrorState message={loadError || '작성 화면을 확인하지 못했습니다.'} retry={() => { if (canAccount() && isForeground()) void load(focusEpoch.current); }} />}</View>;
  if (!options) return <View style={{ padding: 16 }}><ErrorState message={loadError || '양식을 확인하지 못했습니다.'} retry={() => void load(focusEpoch.current)} /></View>;
  if (restricted && confirmation.inline) return <View style={{ flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>{confirmation.dialog}</View>;
  if (restricted) return <View style={{ flex: 1, padding: 16, gap: 8, backgroundColor: theme.background }}>{confirmation.dialog}<Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontWeight: '700' }}>원 요청 결과 확인</Text><Text style={{ color: theme.secondary }}>이 문서는 현재 수정할 수 없습니다. 본문과 첨부 정보를 숨기고 원 요청의 결과만 확인합니다.</Text>{candidate ? <TextAction label="요청 확인 정보 열기" disabled={busy} onPress={() => void restore()} /> : null}{currentPending && !settledTarget ? <TextAction label="원 요청 결과 확인" disabled={busy} onPress={() => void resolvePending()} /> : null}{settledTarget ? <TextAction label={settledTarget.deleted ? "기안함으로 이동" : "결과 문서 확인"} disabled={busy} onPress={() => { if (!canAct() || busyRef.current) return; router.push(settledTarget.deleted ? "/drafts?folder=drafts" : "/documents/" + settledTarget.id); }} /> : null}<TextAction label="작성 복구" disabled={busy} onPress={() => void openRecovery()} /><TextAction label="기안함으로 이동" disabled={busy} onPress={() => { if (canAct()) router.push('/drafts?folder=drafts'); }} /><AccountFeedback error={error} message={notice} /></View>;
  const inputStyle = (name: string) => [styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: errors[name] ? theme.danger : focusedField === name ? theme.accent : theme.muted, borderWidth: focusedField === name ? 2 : 1 }];
  const setField = (name: string, value: string) => update({ values: { ...formRef.current.values, [name]: value } });
  const meetingItems = readMeetingItems(form.values), isMeeting = template?.fields.some(field => field.name === 'agenda') && template.fields.some(field => field.name === 'discussion');
  const updateMeeting = (items: typeof meetingItems) => update({ values: { ...formRef.current.values, ...writeMeetingItems(items) } });
  const pickerOptions = picker?.items.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: item.value === picker.selected }} onFocus={() => setFocusedOption(item.value)} onBlur={() => setFocusedOption('')} onPress={() => choosePicker(item.value)} style={({ pressed }) => [styles.option, { borderColor: focusedOption === item.value ? theme.accent : theme.border, backgroundColor: pressed || item.value === picker.selected ? theme.accentSoft : theme.surface }]}><Text style={{ color: theme.text, flex: 1 }}>{item.label}</Text>{item.value === picker.selected ? <Text style={{ color: theme.accent }}>✓</Text> : null}</Pressable>);
  // Android native Modal creates another window and emits AppState blur. Keep
  // these choices in the Activity so external blur still protects draft text.
  const inlinePicker = (key: string) => Platform.OS === 'android' && picker?.key === key ? <View style={[styles.inlinePicker, { borderColor: theme.border, backgroundColor: theme.surface }]} accessibilityLabel={picker.title + ' 선택 목록'}>
    <View style={styles.sectionRow}><Text accessibilityRole="header" style={[styles.label, { color: theme.text }]}>{picker.confirmValue ? '양식 변경' : picker.title}</Text><TextAction label="닫기" onPress={closePicker} /></View>
    {picker.confirmValue ? <View style={{ gap: 8 }}><Text style={{ color: theme.text }}>{picker.items.find(item => item.value === picker.confirmValue)?.label} 양식으로 바꾸면 현재 양식의 입력 내용이 초기화됩니다. 양식을 바꾸시겠습니까?</Text><View style={styles.actions}><TextAction label="취소" onPress={() => { if (canAct(picker.epoch)) { setPicker({ ...picker, confirmValue: undefined }); picker.onReturnFocus?.(); } }} /><TextAction label="변경" onPress={() => { if (!canAct(picker.epoch) || busyRef.current || settledTarget || !picker.confirmValue) return; picker.choose(picker.confirmValue); closePicker(); }} /></View></View> : <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>{pickerOptions}</ScrollView>}
    {!picker.items.length ? <Text style={{ color: theme.secondary }}>선택할 항목이 없습니다.</Text> : null}
  </View> : null;
  const renderMeeting = () => <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>안건 및 논의 내용 *</Text>{meetingItems.map((item, index) => <View key={index} style={{ gap: 6, borderWidth: 1, borderColor: theme.border, padding: 12, borderRadius: 9 }}><View style={styles.sectionRow}><Text style={{ color: theme.text }}>안건 {index + 1}</Text>{meetingItems.length > 1 ? <TextAction label="안건 제거" disabled={busy} onPress={() => { void confirmed('안건 제거', '이 안건의 제목과 내용을 제거하시겠습니까?', '제거', true).then(accepted => { if (accepted && canAct()) updateMeeting(meetingItems.filter((_, i) => i !== index)); }); }} /> : null}</View><TextInput accessibilityLabel={'안건 ' + (index + 1) + ' 제목'} value={item.title} maxLength={300} editable={!busy && !settledTarget} placeholder="안건 제목" placeholderTextColor={theme.muted} onFocus={() => setFocusedField('agenda' + index)} onBlur={() => setFocusedField('')} style={inputStyle('agenda' + index)} onChangeText={title => updateMeeting(meetingItems.map((v, i) => i === index ? { ...v, title } : v))} /><TextInput accessibilityLabel={'안건 ' + (index + 1) + ' 논의 내용'} value={item.content} maxLength={5000} editable={!busy && !settledTarget} multiline placeholder="논의 내용" placeholderTextColor={theme.muted} onFocus={() => setFocusedField('discussion' + index)} onBlur={() => setFocusedField('')} style={[inputStyle('discussion' + index), styles.textarea]} onChangeText={content => updateMeeting(meetingItems.map((v, i) => i === index ? { ...v, content } : v))} /></View>)}<TextAction label="안건 추가" disabled={busy || !!settledTarget || meetingItems.length >= 20} onPress={() => updateMeeting([...meetingItems, { title: '', content: '' }])} /></View>;
  const renderField = (field: DraftField) => {
    if (isMeeting && field.name === 'agenda') return <View key={field.name}>{renderMeeting()}</View>;
    if (isMeeting && field.name === 'discussion' || field.type === 'attachments' || field.visibleWhen && !field.visibleWhen.values.includes(form.values[field.visibleWhen.field] ?? '')) return null;
    return <View key={field.name} style={styles.field}><Text style={[styles.label, { color: theme.text }]}>{field.label}{field.required ? ' *' : ''}</Text>{field.type === 'select' ? <Choice expanded={Platform.OS === 'android' ? picker?.key === 'field:' + field.name : undefined} label={field.options?.find(item => item.value === form.values[field.name])?.label || '선택하세요'} disabled={busy || !!settledTarget} onPress={onReturnFocus => showPicker('field:' + field.name, field.label, form.values[field.name] ?? '', field.options ?? [], value => setField(field.name, value), onReturnFocus)} /> : field.type === 'checkbox' ? <View style={[styles.checkRow, { borderColor: theme.muted }]}><Text style={{ color: theme.secondary, flex: 1 }}>{field.helpText || field.label}</Text><Switch accessibilityLabel={field.label} disabled={busy || !!settledTarget} value={form.values[field.name] === 'true'} onValueChange={checked => setField(field.name, checked ? 'true' : 'false')} trackColor={{ true: theme.actionFill }} /></View> : <TextInput accessibilityLabel={field.label + (field.required ? ' 필수' : '')} value={form.values[field.name] ?? ''} maxLength={5000} editable={!busy && !settledTarget} multiline={field.type === 'textarea'} keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'} autoCapitalize={field.type === 'date' ? 'none' : 'sentences'} placeholder={field.placeholder || (field.type === 'date' ? 'YYYY-MM-DD' : field.label + ' 입력')} placeholderTextColor={theme.muted} onFocus={() => setFocusedField(field.name)} onBlur={() => setFocusedField('')} style={[inputStyle(field.name), field.type === 'textarea' && styles.textarea]} onChangeText={value => setField(field.name, value)} />}{field.helpText && field.type !== 'checkbox' ? <Text style={[styles.hint, { color: theme.secondary }]}>{field.helpText}</Text> : null}{inlinePicker('field:' + field.name)}{errors[field.name] ? <Text style={{ color: theme.danger }}>{errors[field.name]}</Text> : null}</View>;
  };
  return <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
    {!confirmation.inline ? confirmation.dialog : null}
    <View style={{ flex: 1 }} pointerEvents={confirmation.inline ? 'none' : 'auto'} accessibilityElementsHidden={confirmation.inline} importantForAccessibility={confirmation.inline ? 'no-hide-descendants' : 'auto'}>
    <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.sectionRow}><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>{freshDraft?.status === 'recalled' ? '회수 문서 수정' : '작성 내용'}</Text><TextAction label="작성 복구" disabled={busy} onPress={() => void openRecovery()} /></View>
      <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: recoveryUnavailable ? theme.danger : theme.secondary }]}>{recoveryUnavailable ? '기기 보관을 사용할 수 없습니다. 현재 입력은 유지됩니다.' : storageNotice || (durable ? '작성 내용은 기기에 보관할 수 있습니다. 첨부파일은 보관되지 않습니다.' : '현재 화면에만 보관합니다. 앱을 닫으면 복구할 수 없습니다.')}</Text>
      {candidate ? <View style={[styles.recovery, { borderColor: theme.border }]}><Text style={{ color: theme.text }}>{candidate.pending ? '결과 확인이 필요한 보관 요청이 있습니다.' : '이 작성 범위에 보관한 입력이 있습니다.'}</Text><View style={styles.actions}><TextAction label={candidate.mode === 'proof-only' ? '요청 확인 정보 열기' : '보관 입력 복원'} disabled={busy} onPress={() => void restore()} /><TextAction label="보관 내용 버리기" disabled={busy} onPress={() => void discardCandidate()} /></View></View> : null}
      {currentPending && !settledTarget ? <View style={[styles.recovery, { borderColor: theme.border }]}><Text style={{ color: theme.text }}>원래 {currentPending.intent === 'submit' ? '상신' : '저장'} 요청의 결과를 먼저 확인하세요.</Text><View style={styles.actions}><TextAction label="원 요청 결과 확인" disabled={busy || !!settledTarget} onPress={() => void resolvePending()} />{statusMissing && currentPending.body && !currentPending.hasNewUploads ? <TextAction label="같은 요청 재시도" disabled={busy} onPress={() => void resolvePending(true)} /> : null}</View></View> : null}
      {needsBaseline && !currentPending ? <View style={styles.recovery}><Text style={{ color: theme.secondary }}>최신 내용을 확인한 뒤 기준을 직접 선택하세요.</Text><View style={styles.actions}><TextAction label="최신 내용 확인" disabled={busy} onPress={() => void load(focusEpoch.current)} /><TextAction label="입력 유지·최신 기준 적용" disabled={busy || !freshDraft} onPress={() => void adoptBaseline(false)} /><TextAction label="서버 내용으로 교체" disabled={busy || !freshDraft} onPress={() => void adoptBaseline(true)} /></View></View> : null}
      {settledTarget ? <TextAction label={settledTarget.deleted ? '기안함으로 이동' : '결과 문서 확인'} onPress={() => { if (!canAct() || busyRef.current) return; if (settledTarget.deleted) router.push('/drafts?folder=drafts'); else router.push('/documents/' + settledTarget.id); }} /> : null}
      {settledTarget && followupAvailable ? <TextAction label={!settledTarget.deleted && settledTarget.editable ? '후속 입력으로 계속 작성' : '후속 입력으로 새 기안 작성'} disabled={busy} onPress={() => void continueFollowup()} /> : null}
      <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>문서 양식 *</Text><Choice expanded={Platform.OS === 'android' ? picker?.key === 'template' : undefined} label={template?.name || '사용 가능한 양식 선택'} disabled={busy || !!settledTarget} onPress={onReturnFocus => showPicker('template', '문서 양식', form.templateId, options.templates.map(item => ({ label: item.name, value: item.id })), id => { if (Platform.OS === 'android') applyTemplate(id); else void changeTemplate(id); }, onReturnFocus)} />{inlinePicker('template')}{errors.templateId ? <Text style={{ color: theme.danger }}>{errors.templateId}</Text> : null}</View>
      <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>제목 *</Text><TextInput accessibilityLabel="제목 필수" value={form.title} maxLength={120} editable={!busy && !settledTarget} placeholder="제목을 입력하세요" placeholderTextColor={theme.muted} onFocus={() => setFocusedField('title')} onBlur={() => setFocusedField('')} style={inputStyle('title')} onChangeText={title => update({ title })} />{errors.title ? <Text style={{ color: theme.danger }}>{errors.title}</Text> : null}</View>
      {template?.fields.map(renderField)}
      <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>결재자 *</Text><Choice expanded={Platform.OS === 'android' ? picker?.key === 'approver' : undefined} label={options.approvers.filter(item => form.approverIds.includes(item.id)).map(item => item.name + ' · ' + item.positionName).join(', ') || '시설장 선택'} disabled={busy || !!settledTarget} onPress={onReturnFocus => showPicker('approver', '결재자', form.approverIds[0] ?? '', options.approvers.map(item => ({ label: item.name + ' · ' + item.positionName, value: item.id })), id => update({ approverIds: [id] }), onReturnFocus)} />{inlinePicker('approver')}{errors.approvers ? <Text style={{ color: theme.danger }}>{errors.approvers}</Text> : null}{!options.approvers.length ? <Text style={{ color: theme.danger }}>사용 가능한 시설장 결재자가 없습니다.</Text> : null}</View>
      <View style={styles.field}><View style={styles.sectionRow}><Text style={[styles.label, { color: theme.text }]}>첨부파일 {form.attachments.length + files.length}/{options.attachmentPolicy.maxFileCount}</Text><TextAction label="파일 추가" icon="attach" disabled={locked} onPress={() => void addFiles()} /></View><Text style={[styles.hint, { color: theme.secondary }]}>파일당 {options.attachmentPolicy.maxFileSizeMb}MB · {options.attachmentPolicy.allowedExtensions.map(extension => extension.replace(/^\./, '')).join(', ')}</Text>{[...form.attachments.map(file => ({ file, pending: false })), ...files.map(file => ({ file, pending: true }))].map(({ file, pending: isPending }) => <View key={isPending ? (file as PendingAttachment).key : (file as DraftAttachment).id} style={[styles.fileRow, { borderColor: theme.border, backgroundColor: theme.surface }]}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: theme.text, flexShrink: 1 }}>{file.name}</Text><Text style={[styles.hint, { color: theme.secondary }]}>{fileSize(file.size ?? 0)} · {isPending ? (file as PendingAttachment).completed ? '업로드 완료' : '저장 시 업로드' : '저장된 파일'}</Text></View><TextAction label="제거" disabled={locked} onPress={() => isPending ? removePending(file as PendingAttachment) : void removeExisting(file as DraftAttachment)} /></View>)}</View>
      <Text style={[styles.hint, { color: theme.secondary }]}>* 항목은 상신 시 필수입니다. 작성 중에는 임시저장할 수 있습니다.</Text><AccountFeedback error={error || errors.content} message={notice} />
    </KeyboardScrollView>
    {exitError ? <Text accessibilityRole="alert" style={{ color: theme.danger, backgroundColor: theme.surface, padding: 12, fontSize: 13, lineHeight: 19 }}>{exitError}</Text> : null}
    <View style={[styles.footer, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) }]}>{progress ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, width: '100%', fontSize: 13 }}>{progress}</Text> : null}<View style={{ flex: 1 }}><Choice label="임시저장" disabled={locked || !template} onPress={() => void save('draft')} /></View><View style={{ flex: 1 }}><PrimaryButton ref={submitButton} title={busy ? '처리 중…' : freshDraft?.status === 'recalled' ? '재상신' : '상신'} disabled={locked || !template || !options.approvers.length} onPress={() => { const epoch = focusEpoch.current; void confirmed('결재 상신', '작성한 문서를 시설장에게 상신하시겠습니까?' + (freshDraft?.status === 'recalled' ? ' 결재가 처음부터 진행됩니다.' : ''), freshDraft?.status === 'recalled' ? '재상신' : '상신').then(accepted => { if (accepted && canAct(epoch)) void save('submit'); }); }} /></View></View>
    {Platform.OS !== 'android' ? <Modal visible={!!picker} transparent animationType="none" onRequestClose={closePicker} onShow={() => pickerCancel.current?.focus()} accessibilityLabel={picker?.title}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 16) }]}><View style={styles.sectionRow}><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>{picker?.title}</Text><TextAction ref={pickerCancel} label="닫기" onPress={closePicker} /></View><ScrollView>{pickerOptions}</ScrollView>{!picker?.items.length ? <Text style={{ color: theme.secondary }}>선택할 항목이 없습니다.</Text> : null}</View></View></Modal> : null}
    </View>
    {confirmation.inline ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>{confirmation.dialog}</View> : null}
  </KeyboardScreen>;
}
function Choice({ label, disabled, expanded, onPress }: { label: string; disabled?: boolean; expanded?: boolean; onPress(onReturnFocus: () => void): void }) {
  const theme = useTheme(), [focused, setFocused] = useState(false), origin = useRef<View>(null);
  return <Pressable ref={origin} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, expanded }} disabled={disabled} onPress={() => onPress(() => origin.current?.focus())} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.input, { justifyContent: 'center', borderColor: focused ? theme.accent : theme.muted, borderWidth: focused ? 2 : 1, backgroundColor: pressed ? theme.accentSoft : theme.surface, opacity: disabled ? 0.55 : 1 }]}><Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ loading: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 12 }, content: { padding: 16, paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 12 }, field: { gap: 6 }, label: { fontSize: 14, fontWeight: '700' }, input: { minHeight: 48, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 }, textarea: { minHeight: 116, textAlignVertical: 'top' }, hint: { fontSize: 12, lineHeight: 18 }, checkRow: { minHeight: 48, flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 9 }, sectionRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, fileRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderRadius: 9 }, recovery: { borderWidth: 1, borderRadius: 9, padding: 8, gap: 4 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, borderTopWidth: 1 }, inlinePicker: { borderWidth: 1, borderRadius: 9, padding: 8, gap: 4 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 16 }, modal: { maxHeight: '80%', width: '100%', maxWidth: 480, padding: 16, borderRadius: 12 }, option: { minHeight: 48, padding: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 } });
