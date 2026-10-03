import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { TextAction } from "@/components/ui";
import { formatWorkLogTimestamp, type WorkLogTarget } from "@/lib/work-logs";
import { useTheme } from "@/lib/theme";
import type { MobileWorkLogEntry } from "@/lib/types";

export function WorkLogContent({ entry, onNavigate, disabled = false }: { entry: MobileWorkLogEntry | null; onNavigate: (target: WorkLogTarget) => void; disabled?: boolean }) {
  const theme = useTheme(); const [allTasks, setAllTasks] = useState(false); const [allMeetings, setAllMeetings] = useState(false);
  const tasks = entry?.completedTasks ?? []; const meetings = entry?.meetingDocuments ?? [];
  return <View style={styles.group}>
    <Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>완료한 할 일 {tasks.length}건</Text>
    {tasks.length ? <View role="list" accessibilityLabel="완료한 할 일">{(allTasks ? tasks : tasks.slice(0, 5)).map(task => <View key={task.id} role="listitem" style={[styles.row, { borderColor: theme.border }]}>
      <WorkLogRowLink label={task.title} accessibilityLabel={`${task.title} 할 일 상세`} disabled={disabled} onPress={() => onNavigate({ pathname: "/tasks/[id]", params: { id: task.id } })} />
      <Text style={[styles.small, { color: theme.secondary }]}>{formatWorkLogTimestamp(task.completedAt)} 완료{task.meetingTitle ? ` · ${task.meetingTitle}` : ""}</Text>
    </View>)}</View> : <Text style={[styles.small, { color: theme.secondary }]}>이 날짜에 완료한 할 일이 없습니다.</Text>}
    {tasks.length > 5 ? <TextAction label={allTasks ? "할 일 접기" : `할 일 ${tasks.length - 5}건 더 보기`} onPress={() => setAllTasks(value => !value)} /> : null}
    <Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>승인 회의록 {meetings.length}건</Text>
    {meetings.length ? <View role="list" accessibilityLabel="승인 회의록">{(allMeetings ? meetings : meetings.slice(0, 5)).map(meeting => <View key={meeting.id} role="listitem" style={[styles.row, { borderColor: theme.border }]}>
      <WorkLogRowLink label={meeting.title} accessibilityLabel={`${meeting.title} 회의록 원문`} disabled={disabled} onPress={() => onNavigate({ pathname: "/documents/[id]", params: { id: meeting.id } })} />
      <Text style={[styles.small, { color: theme.secondary }]}>{meeting.documentNo ?? "문서번호 없음"} · 승인 완료 · 첨부 {meeting.attachments.length}개</Text>
      <View role="list" accessibilityLabel={`${meeting.title} 첨부파일`}>{meeting.attachments.map(file => <View key={file.id} role="listitem"><WorkLogRowLink label={`${file.name}${file.isSigned ? " · 서명본" : ""}`} accessibilityLabel={`${file.name}${file.isSigned ? " 서명본" : ""} 첨부파일 열기`} disabled={disabled} onPress={() => onNavigate({ pathname: "/attachments/[id]", params: { id: file.id } })} /></View>)}</View>
    </View>)}</View> : <Text style={[styles.small, { color: theme.secondary }]}>이 날짜의 열람 가능한 승인 회의록이 없습니다.</Text>}
    {meetings.length > 5 ? <TextAction label={allMeetings ? "회의록 접기" : `회의록 ${meetings.length - 5}건 더 보기`} onPress={() => setAllMeetings(value => !value)} /> : null}
  </View>;
}
export function WorkLogRowLink({ label, accessibilityLabel, disabled = false, onPress }: { label: string; accessibilityLabel?: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme(); const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [{ minHeight: 44, minWidth: 44, width: "100%", justifyContent: "center", alignItems: "flex-start", paddingHorizontal: 4, paddingVertical: 6, borderWidth: 2, borderRadius: 8 }, { borderColor: focused ? theme.accent : "transparent", backgroundColor: focused || pressed ? theme.accentSoft : "transparent", opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: theme.accent, fontSize: 14, fontWeight: "700", lineHeight: 21, flexShrink: 1, width: "100%" }}>{label}</Text></Pressable>;
}
export function WorkLogField({ name, label, value, onChange, error, disabled = false, multiline = false, maxLength, placeholder }: { name: string; label: string; value: string; onChange: (name: string, value: string) => void; error?: string; disabled?: boolean; multiline?: boolean; maxLength?: number; placeholder?: string }) {
  const theme = useTheme(); const [focused, setFocused] = useState(false);
  return <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} aria-invalid={!!error} editable={!disabled} value={value} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={theme.muted} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChangeText={next => onChange(name, next)} style={[styles.input, multiline && styles.multiline, { color: theme.text, backgroundColor: theme.surface, borderColor: error ? theme.danger : focused ? theme.accent : theme.muted, opacity: disabled ? 0.65 : 1 }]} />{error ? <Text style={[styles.small, { color: theme.danger }]}>{error}</Text> : null}</View>;
}
const styles = StyleSheet.create({ group: { gap: 8 }, row: { paddingBottom: 8, borderBottomWidth: 1, gap: 4 }, label: { fontSize: 15, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] }, body: { fontSize: 15, lineHeight: 23 }, field: { gap: 4 }, input: { minHeight: 44, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16 }, multiline: { minHeight: 180 } });
