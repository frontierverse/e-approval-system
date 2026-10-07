import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { router } from "expo-router";
import { useNavigation } from 'expo-router/react-navigation';
import { usePreventRemove } from '@/lib/use-protected-navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { emptyTaskFormValues, isTaskId, newTaskRequestId, normalizeTaskFormValues, validateTaskFormValues, type TaskFormErrors, type TaskFormValues } from "@/lib/tasks";
import { useTheme } from "@/lib/theme";
import type { MobileStaffTaskMutationResponse } from "@/lib/types";

export function TaskEditor() {
  const { token } = useSession();
  const currentToken = useRef(token);
  useLayoutEffect(() => { currentToken.current = token; }, [token]);
  const isCurrentAccount = useCallback(() => !!token && currentToken.current === token, [token]);
  return token ? <TaskEditorContent key={token} isCurrentAccount={isCurrentAccount} /> : null;
}
function TaskEditorContent({ isCurrentAccount }: { isCurrentAccount: () => boolean }) {
  const { request, user } = useSession();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const confirmation = useConfirmAction();
  const [values, setValues] = useState<TaskFormValues>({ ...emptyTaskFormValues });
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [requestConflict, setRequestConflict] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const allowLeave = useRef(false);
  const attempt = useRef<{ requestId: string; values: TaskFormValues } | null>(null);
  const invalidateScope = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    alive.current = true; invalidateScope();
    return () => { alive.current = false; invalidateScope(); busyRef.current = false; };
  }, [invalidateScope]);
  const active = (scope: number) => alive.current && generation.current === scope && isCurrentAccount();
  const dirty = Object.values(values).some(value => value !== "");
  usePreventRemove(!!user && (dirty || busy), ({ data }) => {
    if (!isCurrentAccount()) return;
    if (allowLeave.current) { navigation.dispatch(data.action); return; }
    if (busyRef.current) return;
    const scope = generation.current;
    void confirmation.ask({ title: "할 일 등록 화면 나가기", message: "입력 내용이 저장되지 않았습니다. 나가시겠습니까?", confirm: "나가기", danger: true })
      .then(accepted => { if (accepted && active(scope)) navigation.dispatch(data.action); });
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty || !user) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, user]);

  const changeValue = (name: keyof TaskFormValues, value: string) => {
    if (busyRef.current || uncertain || requestConflict) return;
    setValues(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
    setError(null);
  };
  const submit = async () => {
    if (busyRef.current || requestConflict || !isCurrentAccount()) return;
    const fields = validateTaskFormValues(values);
    if (Object.keys(fields).length) {
      setErrors(fields); setError("입력 내용을 확인해 주세요."); return;
    }
    // Replay an uncertain request with the original normalized payload and identifier.
    // Definitive validation failures release this attempt so corrected values may use a new key.
    const pending = uncertain && attempt.current ? attempt.current : { requestId: newTaskRequestId(), values: normalizeTaskFormValues(values) };
    attempt.current = pending;
    const scope = generation.current;
    busyRef.current = true; setBusy(true); setError(null); setErrors({});
    try {
      const result = await request<MobileStaffTaskMutationResponse>("/tasks", { method: "POST", body: { ...pending.values, requestId: pending.requestId } });
      if (!active(scope)) return;
      if (result.ok !== true || !isTaskId(result.task?.id)) throw new ApiError("등록 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요.", 200);
      allowLeave.current = true;
      router.replace({ pathname: "/tasks/[id]", params: { id: result.task.id, notice: "created", page: "1" } });
    } catch (cause) {
      if (!active(scope)) return;
      const unknownResult = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300);
      setUncertain(unknownResult);
      setRequestConflict(cause instanceof ApiError && cause.status === 409);
      if (!unknownResult) attempt.current = null;
      setErrors(cause instanceof ApiError && cause.fields ? cause.fields : {});
      setError(cause instanceof Error ? cause.message : "할 일을 등록하지 못했습니다. 다시 시도하세요.");
    } finally {
      if (generation.current === scope) busyRef.current = false;
      if (active(scope)) setBusy(false);
    }
  };
  const disabled = busy || uncertain || requestConflict;
  return <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
      <Text style={[styles.hint, { color: theme.secondary, marginBottom: 12 }]}>본인의 할 일로 등록됩니다.</Text>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TaskField label="할 일" name="title" value={values.title} onChange={changeValue} disabled={disabled} error={errors.title} maxLength={160} required placeholder="예: 다음 회의 전 활동 계획안 정리" />
        <TaskField label="기한" name="dueDate" value={values.dueDate} onChange={changeValue} disabled={disabled} error={errors.dueDate} maxLength={10} placeholder="YYYY-MM-DD" />
        <Text style={[styles.hint, { color: theme.secondary, marginTop: -4 }]}>선택 입력 · 한국 날짜 기준 · 예: 2026-10-03</Text>
        <TaskField label="회의명" name="meetingTitle" value={values.meetingTitle} onChange={changeValue} disabled={disabled} error={errors.meetingTitle} maxLength={160} placeholder="회의명이 있는 경우 입력" />
        <TaskField label="상세 내용" name="description" value={values.description} onChange={changeValue} disabled={disabled} error={errors.description} maxLength={2000} multiline placeholder="결과물, 참고 사항 등" />
      </View>
      <AccountFeedback error={error} />
      {uncertain ? <Text style={[styles.hint, { color: theme.secondary, marginTop: 6 }]}>등록 결과를 확인할 때까지 입력을 유지합니다. 같은 내용과 요청 번호로 다시 확인하므로 중복 등록되지 않습니다.</Text> : null}
      {requestConflict ? <Text style={[styles.hint, { color: theme.secondary, marginTop: 6 }]}>이미 처리된 등록 요청입니다. 내 할 일 목록에서 확인한 뒤 새 등록 화면을 열어 주세요. 입력 내용은 이 화면에 유지됩니다.</Text> : null}
      <View style={styles.actions}>
        {!requestConflict ? <PrimaryButton title={busy ? "등록 확인 중..." : uncertain ? "등록 결과 다시 확인" : "할 일 등록"} disabled={busy} onPress={() => void submit()} /> : null}
        {uncertain || requestConflict ? <TextAction label="내 할 일에서 확인" disabled={busy} onPress={() => router.push("/tasks")} /> : null}
      </View>
    </KeyboardScrollView>
    {confirmation.dialog}
  </KeyboardScreen>;
}
function TaskField({ label, name, value, onChange, disabled, error, maxLength, placeholder, multiline, required }: {
  label: string; name: keyof TaskFormValues; value: string; onChange: (name: keyof TaskFormValues, value: string) => void;
  disabled: boolean; error?: string; maxLength: number; placeholder: string; multiline?: boolean; required?: boolean;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <View style={styles.labelRow}><Text style={[styles.label, { color: theme.text }]}>{label}{required ? " (필수)" : " (선택)"}</Text>
      {name !== "dueDate" ? <Text style={[styles.hint, { color: theme.secondary }]}>{value.length.toLocaleString("ko-KR")} / {maxLength.toLocaleString("ko-KR")}</Text> : null}</View>
    <TextInput accessibilityLabel={`${label}${required ? " (필수)" : " (선택)"}`} value={value} onChangeText={text => onChange(name, text)} editable={!disabled} maxLength={maxLength} multiline={multiline}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoCapitalize={name === "dueDate" ? "none" : "sentences"} autoCorrect={name !== "dueDate"} placeholder={placeholder} placeholderTextColor={theme.muted}
      style={[styles.input, multiline ? styles.textarea : null, { borderColor: focused ? theme.accent : error ? theme.danger : theme.muted, borderWidth: focused ? 2 : 1, color: theme.text, backgroundColor: theme.surface, opacity: disabled ? 0.65 : 1 }]} />
    {error ? <Text style={[styles.hint, { color: theme.danger }]}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  panel: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  field: { gap: 5 },
  labelRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  label: { fontSize: 13, fontWeight: "700" },
  hint: { fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  textarea: { minHeight: 108, textAlignVertical: "top" },
  actions: { marginTop: 12, gap: 4 },
});
