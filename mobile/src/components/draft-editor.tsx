import { router, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState, PrimaryButton, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { attachmentError, fileSize, requestKey, type DraftAttachment, type DraftData, type DraftField, type DraftOptions, type PendingAttachment, type SaveDraftResult } from "@/lib/drafts";
import { readMeetingItems, writeMeetingItems } from "@/lib/meeting-items";
import { uploadFile } from "@/lib/upload-file";

function confirmAction(title: string, message: string, confirm: string, action: () => void) {
  if (Platform.OS === "web") { if (window.confirm(message)) action(); }
  else Alert.alert(title, message, [{ text: "취소", style: "cancel" }, { text: confirm, style: "destructive", onPress: action }]);
}

export function DraftEditor({ documentId }: { documentId?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { request } = useSession();
  const navigation = useNavigation();
  const [options, setOptions] = useState<DraftOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [approverIds, setApprovers] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const filesRef = useRef<PendingAttachment[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const allowLeave = useRef(false);
  const attempt = useRef<{ signature: string; requestId: string } | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [picker, setPicker] = useState<null | { title: string; selected: string; items: { label: string; value: string }[]; choose: (value: string) => void }>(null);
  const snapshot = JSON.stringify({ title, templateId, values, approverIds, attachments: attachments.map(a => a.id), files: pendingFiles.map(f => f.key) });
  const dirty = !!baseline && snapshot !== baseline;
  usePreventRemove(dirty || busy, ({ data }) => {
    if (allowLeave.current) { navigation.dispatch(data.action); return; }
    if (busyRef.current) return;
    confirmAction("작성 화면 나가기", "저장하지 않은 입력 내용이 있습니다. 나가시겠습니까?", "나가기", () => navigation.dispatch(data.action));
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  const load = useCallback(async () => {
    try {
      const [o, result] = await Promise.all([request<DraftOptions>("/drafts/options"), documentId ? request<{ draft: DraftData }>("/drafts/" + documentId) : Promise.resolve(null)]);
      setOptions(o);
      const d = result?.draft;
      const selected = o.templates.find(t => t.id === d?.templateId) ?? (!d ? o.templates[0] : undefined);
      const nextTitle = d?.title === "제목 없는 기안" ? "" : d?.title ?? "";
      const nextTemplate = d?.templateId ?? selected?.id ?? "";
      const nextValues = d?.fieldValues ?? selected?.initialValues ?? {};
      const nextApprovers = d?.approverIds ?? (o.approvers.length === 1 ? [o.approvers[0].id] : []);
      const nextAttachments = d?.attachments ?? [];
      setTitle(nextTitle); setTemplateId(nextTemplate); setValues(nextValues); setApprovers(nextApprovers);
      setAttachments(nextAttachments); setUpdatedAt(d?.updatedAt ?? null);
      filesRef.current = []; setPendingFiles([]);
      setBaseline(JSON.stringify({ title: nextTitle, templateId: nextTemplate, values: nextValues, approverIds: nextApprovers, attachments: nextAttachments.map(a => a.id), files: [] }));
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "작성 화면을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [documentId, request]);
  const initialized = useRef(false);
  useFocusEffect(useCallback(() => { if (initialized.current) return; initialized.current = true; void load(); }, [load]));
  const template = options?.templates.find(t => t.id === templateId);
  const setField = (name: string, value: string) => { setValues(v => ({ ...v, [name]: value })); setNotice(""); };
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }];
  const showPicker = (name: string, selected: string, items: { label: string; value: string }[], choose: (value: string) => void) => setPicker({ title: name, selected, items, choose });
  const changeTemplate = (id: string) => {
    const change = () => { setTemplateId(id); setValues(options?.templates.find(t => t.id === id)?.initialValues ?? {}); setErrors({}); setNotice(""); };
    if (id === templateId) return;
    const changedContent = JSON.stringify(values) !== JSON.stringify(template?.initialValues ?? {});
    if (changedContent) confirmAction("양식 변경", "양식을 바꾸면 현재 양식의 입력 내용이 초기화됩니다. 변경하시겠습니까?", "변경", change);
    else change();
  };
  const addFiles = async () => {
    if (busyRef.current || !options) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: "*/*", base64: false });
      if (result.canceled) return;
      if (attachments.length + filesRef.current.length + result.assets.length > options.attachmentPolicy.maxFileCount) throw new Error("첨부파일은 " + options.attachmentPolicy.maxFileCount + "개까지 등록할 수 있습니다.");
      for (const file of result.assets) { const message = attachmentError(file, options.attachmentPolicy); if (message) throw new Error(message); }
      filesRef.current = [...filesRef.current, ...result.assets.map(f => ({ ...f, key: requestKey() }))];
      setPendingFiles([...filesRef.current]); setError(""); setNotice("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "파일을 선택하지 못했습니다."); }
  };
  const removePending = (file: PendingAttachment) => {
    filesRef.current = filesRef.current.filter(f => f.key !== file.key);
    setPendingFiles([...filesRef.current]);
    if (file.uploadId) void request("/drafts/uploads/" + file.uploadId, { method: "DELETE" }).catch(() => undefined);
  };
  const removeExisting = (file: DraftAttachment) => {
    if (!documentId || busyRef.current) return;
    confirmAction("첨부파일 삭제", '"' + file.name + '" 파일을 문서에서 삭제하시겠습니까?', "삭제", () => {
      busyRef.current = true; setBusy(true); setError("");
      void request<{ draft: DraftData }>("/drafts/" + documentId + "/attachments/" + file.id, { method: "DELETE" })
        .then(result => { setAttachments(result.draft.attachments); setUpdatedAt(result.draft.updatedAt); setNotice("첨부파일을 삭제했습니다."); })
        .catch(cause => setError(cause instanceof Error ? cause.message : "파일을 삭제하지 못했습니다."))
        .finally(() => { busyRef.current = false; setBusy(false); });
    });
  };
  const save = async (intent: "draft" | "submit") => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setErrors({}); setNotice("");
    try {
      const clientErrors: Record<string, string> = {};
      if (!template) clientErrors.templateId = "사용 가능한 문서 양식을 선택하세요.";
      if (intent === "submit" && title.trim().length < 2) clientErrors.title = "제목은 2자 이상 입력하세요.";
      if (intent === "submit" && approverIds.length !== 1) clientErrors.approvers = "시설장 1명을 결재자로 지정하세요.";
      if (Object.keys(clientErrors).length) { setErrors(clientErrors); throw new Error(Object.values(clientErrors)[0]); }
      for (let i = 0; i < filesRef.current.length; i++) {
        const file = filesRef.current[i];
        if (file.completed) continue;
        setProgress("첨부파일 업로드 " + (i + 1) + "/" + filesRef.current.length);
        if (!file.uploadId) {
          const signed = await request<{ uploadId: string; uploadUrl: string; mimeType: string }>("/drafts/uploads", { method: "POST", body: { name: file.name, size: file.size, mimeType: file.mimeType } });
          file.uploadId = signed.uploadId; file.uploadUrl = signed.uploadUrl;
        } else if (!file.uploaded) {
          // A lost PUT response may still mean the file reached storage.
          const completed = await request("/drafts/uploads/" + file.uploadId + "/complete", { method: "POST" }).then(() => true).catch(() => false);
          if (completed) { file.completed = true; continue; }
        }
        if (!file.uploaded) { await uploadFile(file, file.uploadUrl!, file.mimeType || "application/octet-stream"); file.uploaded = true; }
        await request("/drafts/uploads/" + file.uploadId + "/complete", { method: "POST" });
        file.completed = true; setPendingFiles([...filesRef.current]);
      }
      setProgress(intent === "submit" ? "상신 중" : "저장 중");
      const body = { title, templateId, fieldValues: values, approverIds, uploadIds: filesRef.current.map(f => f.uploadId!), intent, expectedUpdatedAt: updatedAt };
      const signature = JSON.stringify(body);
      if (attempt.current?.signature !== signature) attempt.current = { signature, requestId: requestKey() };
      const result = await request<SaveDraftResult>(documentId ? "/drafts/" + documentId : "/drafts", { method: "POST", body: { ...body, requestId: attempt.current.requestId } });
      allowLeave.current = true;
      if (intent === "submit" || result.status !== "draft") router.replace("/documents/" + result.documentId);
      else if (!documentId) router.replace("/drafts/" + result.documentId);
      else {
        const refreshed = await request<{ draft: DraftData }>("/drafts/" + documentId);
        setAttachments(refreshed.draft.attachments); setUpdatedAt(refreshed.draft.updatedAt);
        filesRef.current = []; setPendingFiles([]); attempt.current = null;
        setBaseline(JSON.stringify({ title, templateId, values, approverIds, attachments: refreshed.draft.attachments.map(a => a.id), files: [] }));
        allowLeave.current = false; setNotice("임시저장했습니다.");
      }
    } catch (cause) {
      allowLeave.current = false;
      if (cause instanceof ApiError && cause.fields) setErrors(cause.fields);
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다. 다시 시도하세요.");
    } finally { busyRef.current = false; setBusy(false); setProgress(""); }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.secondary }}>작성 화면 불러오는 중</Text></View>;
  if (loadError || !options) return <View style={{ padding: 16 }}><ErrorState message={loadError || "양식을 불러오지 못했습니다."} retry={() => { setLoading(true); setLoadError(""); void load(); }} /></View>;
  const fieldError = (name: string) => errors[name] ? <Text style={[styles.error, { color: theme.danger }]}>{errors[name]}</Text> : null;
  const isMeeting = template?.fields.some(f => f.name === "agenda") && template?.fields.some(f => f.name === "discussion");
  const meetingItems = readMeetingItems(values);
  const updateMeeting = (items: typeof meetingItems) => { setValues(v => ({ ...v, ...writeMeetingItems(items) })); setNotice(""); };
  const renderField = (field: DraftField) => {
    if (isMeeting && (field.name === "agenda" || field.name === "discussion")) return null;
    if (field.visibleWhen && !field.visibleWhen.values.includes(values[field.visibleWhen.field] ?? "")) return null;
    if (field.type === "attachments") return null;
    return <View key={field.name} style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{field.label}{field.required ? " *" : ""}</Text>
      {field.type === "select" ? <Choice label={field.options?.find(o => o.value === values[field.name])?.label || "선택하세요"} disabled={busy}
        onPress={() => showPicker(field.label, values[field.name] ?? "", field.options ?? [], value => setField(field.name, value))} /> :
        field.type === "checkbox" ? <View style={[styles.checkRow, { borderColor: theme.border }]}>
          <Text style={{ flex: 1, color: theme.secondary }}>{field.helpText || field.label}</Text>
          <Switch accessibilityLabel={field.label} disabled={busy} value={values[field.name] === "true"} onValueChange={checked => setField(field.name, checked ? "true" : "false")} trackColor={{ true: theme.actionFill }} />
        </View> :
        <TextInput accessibilityLabel={field.label + (field.required ? " 필수" : "")} editable={!busy} value={values[field.name] ?? ""}
          onChangeText={value => setField(field.name, value)} maxLength={5000} multiline={field.type === "textarea"}
          keyboardType={field.type === "number" ? "decimal-pad" : "default"} autoCapitalize={field.type === "date" ? "none" : "sentences"}
          placeholder={field.placeholder || (field.type === "date" ? "YYYY-MM-DD" : field.label + " 입력")} placeholderTextColor={theme.muted}
          style={[inputStyle, field.type === "textarea" && styles.textarea]} />}
      {field.type === "date" ? <Text style={[styles.hint, { color: theme.secondary }]}>날짜 형식: 2026-10-02</Text> : null}
      {field.helpText && field.type !== "checkbox" ? <Text style={[styles.hint, { color: theme.secondary }]}>{field.helpText}</Text> : null}
    </View>;
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={96}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>문서 양식 *</Text>
        <Choice label={template?.name || "사용 가능한 양식 선택"} disabled={busy} onPress={() => showPicker("문서 양식", templateId, options.templates.map(t => ({ label: t.name, value: t.id })), changeTemplate)} />
        {fieldError("templateId")}
      </View>
      <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>제목 *</Text>
        <TextInput accessibilityLabel="제목 필수" value={title} onChangeText={value => { setTitle(value); setNotice(""); }} maxLength={120} editable={!busy}
          placeholder="제목을 입력하세요" placeholderTextColor={theme.muted} style={inputStyle} />
        {fieldError("title")}
      </View>
      {template?.fields.map(renderField)}
      {isMeeting ? <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>안건 및 논의 내용 *</Text>
        {meetingItems.map((item, index) => <View key={index} style={[styles.field, { padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 9 }]}>
          <View style={styles.sectionRow}><Text style={[styles.label, { color: theme.text }]}>안건 {index + 1}</Text>{meetingItems.length > 1 ? <TextAction label="안건 제거" disabled={busy} onPress={() => confirmAction("안건 제거", "이 안건의 제목과 내용을 제거하시겠습니까?", "제거", () => updateMeeting(meetingItems.filter((_, i) => i !== index)))} /> : null}</View>
          <TextInput accessibilityLabel={"안건 " + (index + 1) + " 제목"} editable={!busy} value={item.title} maxLength={300} placeholder="안건 제목" placeholderTextColor={theme.muted} style={inputStyle} onChangeText={title => updateMeeting(meetingItems.map((v, i) => i === index ? { ...v, title } : v))} />
          <TextInput accessibilityLabel={"안건 " + (index + 1) + " 논의 내용"} editable={!busy} multiline value={item.content} maxLength={5000} placeholder="논의 내용을 입력하세요" placeholderTextColor={theme.muted} style={[inputStyle, styles.textarea]} onChangeText={content => updateMeeting(meetingItems.map((v, i) => i === index ? { ...v, content } : v))} />
        </View>)}
        <TextAction label="안건 추가" icon="add" disabled={busy || meetingItems.length >= 20} onPress={() => updateMeeting([...meetingItems, { title: "", content: "" }])} />
      </View> : null}
      {fieldError("content")}
      <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>결재자 *</Text>
        <Choice disabled={busy} label={options.approvers.find(a => approverIds.includes(a.id)) ? options.approvers.filter(a => approverIds.includes(a.id)).map(a => a.name + " · " + a.positionName).join(", ") : "시설장 선택"}
          onPress={() => showPicker("결재자", approverIds[0] ?? "", options.approvers.map(a => ({ label: a.name + " · " + a.positionName, value: a.id })), id => { setApprovers([id]); setNotice(""); })} />
        {!options.approvers.length ? <Text style={[styles.error, { color: theme.danger }]}>선택할 수 있는 시설장이 없습니다. 임시저장 후 관리자에게 문의하세요.</Text> : null}
        {fieldError("approvers")}
      </View>
      <View style={styles.field}>
        <View style={styles.sectionRow}><Text style={[styles.label, { color: theme.text }]}>첨부파일 {attachments.length + pendingFiles.length}/{options.attachmentPolicy.maxFileCount}</Text><TextAction label="파일 추가" icon="attach" disabled={busy} onPress={addFiles} /></View>
        <Text style={[styles.hint, { color: theme.secondary }]}>파일당 {options.attachmentPolicy.maxFileSizeMb}MB · {options.attachmentPolicy.allowedExtensions.map(e => e.slice(1)).join(", ")}</Text>
        {[...attachments.map(file => ({ file, pending: false })), ...pendingFiles.map(file => ({ file, pending: true }))].map(({ file, pending }) => <View key={pending ? (file as PendingAttachment).key : (file as DraftAttachment).id} style={[styles.fileRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={{ flex: 1 }}><Text style={{ color: theme.text, fontSize: 14 }}>{file.name}</Text><Text style={[styles.hint, { color: theme.secondary }]}>{fileSize(file.size ?? 0)} · {pending ? (file as PendingAttachment).completed ? "업로드 완료" : "저장 시 업로드" : "저장된 파일"}</Text></View>
          <TextAction label="제거" icon="close" disabled={busy} onPress={() => pending ? removePending(file as PendingAttachment) : removeExisting(file as DraftAttachment)} />
        </View>)}
      </View>
      <Text style={[styles.hint, { color: theme.secondary }]}>* 항목은 상신 시 필수입니다. 작성 중에는 임시저장할 수 있습니다.</Text>
      {error ? <View accessibilityRole="alert" style={[styles.message, { backgroundColor: theme.dangerSoft }]}><Text style={{ color: theme.danger }}>{error}</Text><Text style={[styles.hint, { color: theme.danger }]}>입력 내용은 유지됩니다.</Text></View> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={{ color: theme.success, paddingVertical: 8 }}>{notice}</Text> : null}
    </ScrollView>
    <View style={[styles.footer, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {progress ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, width: "100%", fontSize: 13 }}>{progress}</Text> : null}
      <View style={{ flex: 1 }}><Choice label="임시저장" disabled={busy || !template} onPress={() => void save("draft")} /></View>
      <View style={{ flex: 1 }}><PrimaryButton title={busy ? "처리 중…" : "상신"} disabled={busy || !template || !options.approvers.length} onPress={() => confirmAction("결재 상신", "작성한 문서를 시설장에게 상신하시겠습니까?", "상신", () => void save("submit"))} /></View>
    </View>
    <Modal visible={!!picker} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.sectionRow}><Text accessibilityRole="header" style={[styles.label, { color: theme.text, fontSize: 18 }]}>{picker?.title}</Text><TextAction label="닫기" icon="close" onPress={() => setPicker(null)} /></View>
        <ScrollView>{picker?.items.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: item.value === picker.selected }}
          onPress={() => { picker.choose(item.value); setPicker(null); }} style={({ pressed }) => [styles.option, { borderColor: theme.border, backgroundColor: pressed || item.value === picker.selected ? theme.accentSoft : theme.surface }]}>
          <Text style={{ color: theme.text, flex: 1, fontSize: 16 }}>{item.label}</Text>{item.value === picker.selected ? <Text style={{ color: theme.accent }}>✓</Text> : null}
        </Pressable>)}</ScrollView>
        {!picker?.items.length ? <Text style={{ color: theme.secondary, padding: 16 }}>선택할 항목이 없습니다.</Text> : null}
      </View></View>
    </Modal>
  </KeyboardAvoidingView>;
}

function Choice({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.input, { justifyContent: "center", borderColor: theme.border, backgroundColor: pressed ? theme.accentSoft : theme.surface, opacity: disabled ? 0.55 : 1 }]}>
    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  content: { padding: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  field: { marginBottom: 16, gap: 6 },
  label: { fontSize: 14, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
  textarea: { minHeight: 116, textAlignVertical: "top" },
  hint: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 13, marginTop: 2 },
  checkRow: { minHeight: 48, flexDirection: "row", gap: 12, alignItems: "center", paddingHorizontal: 12, borderWidth: 1, borderRadius: 9 },
  sectionRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  fileRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, paddingLeft: 12, borderWidth: 1, borderRadius: 9 },
  message: { padding: 12, borderRadius: 9, marginTop: 12 },
  footer: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 12, borderTopWidth: 1 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { maxHeight: "75%", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  option: { minHeight: 52, padding: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 },
});
