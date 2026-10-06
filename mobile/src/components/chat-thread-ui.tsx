import { Feather } from "@expo/vector-icons";
import { useState, type ReactNode, type Ref } from "react";
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions, Platform, type TextStyle } from "react-native";
import { DetailText as Text } from "./document-detail-ui";
import { attachmentFileSize } from "@/lib/attachment-file";
import { formatChatTimestamp } from "@/lib/chat";
import { useHomeTheme } from "@/lib/home-theme";
import type { ChatAttachment, ChatMessage } from "@/lib/types";

type ActionProps = { label: string; accessibilityLabel?: string; icon?: keyof typeof Feather.glyphMap; iconOnly?: boolean; disabled?: boolean; onPress: () => void; ref?: Ref<View>; attachment?: ChatAttachment; pill?: boolean; panel?: boolean; warning?: boolean };
export function ChatThreadAction({ label, accessibilityLabel, icon, iconOnly, disabled, onPress, ref, attachment, pill, panel, warning }: ActionProps) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  const action = <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={({ pressed }) => [styles.action, attachment && { alignSelf: "stretch", flexShrink: 0 }, pill && { borderRadius: 22, alignSelf: "center", paddingHorizontal: 14 }, panel && { minHeight: 48 }, iconOnly && { width: 44, paddingHorizontal: 0 },
      { borderColor: focus ? theme.accent : iconOnly ? "transparent" : warning ? theme.secondary : theme.controlBorder, backgroundColor: iconOnly ? "transparent" : theme.surface, opacity: pressed && !disabled ? .8 : 1 }]}>
    {icon ? <Feather name={icon} size={iconOnly ? 22 : 16} color={theme.secondary} accessible={false} aria-hidden /> : null}
    {!iconOnly ? <Text style={{ color: disabled ? theme.secondary : theme.text, fontSize: pill ? 13 : panel ? 15 : 14, lineHeight: panel ? 22 : 20, fontWeight: "700", textAlign: "center", flexShrink: 1 }}>{attachment ? "파일 작업 열기" : label}</Text> : null}
  </Pressable>;
  return attachment ? <View style={{ width: "100%", padding: 10, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}><ChatThreadFileSummary attachment={attachment} />{["deleted", "deleting"].includes(attachment.status) ? null : action}</View> : action;
}
export function ChatThreadSend({ title, displayTitle, disabled, onPress, panel }: { title: string; displayTitle?: string; disabled?: boolean; onPress: () => void; panel?: boolean }) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={displayTitle ?? title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={({ pressed }) => [styles.action, { minWidth: 76, minHeight: panel ? 48 : 44, paddingHorizontal: 16, borderColor: focus ? theme.text : disabled ? theme.border : theme.actionFill, backgroundColor: disabled ? theme.surface : theme.actionFill, opacity: pressed && !disabled ? .8 : 1 }]}>
    <Text style={{ color: disabled ? theme.secondary : "#FFFFFF", fontSize: 15, lineHeight: 22, fontWeight: "700", flexShrink: 1, textAlign: "center" }}>{displayTitle ?? title}</Text>
  </Pressable>;
}
export function ChatThreadInput({ label, value, onChange, disabled, multiline, placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; multiline?: boolean; placeholder?: string }) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false), [inputHeight, setInputHeight] = useState(44);
  return <TextInput accessibilityLabel={label} value={value} onChangeText={value => { if (!disabled) onChange(value); }} editable={!disabled} multiline={multiline} onContentSizeChange={event => setInputHeight(Math.max(44, Math.min(135, event.nativeEvent.contentSize.height)))} placeholder={placeholder} placeholderTextColor={theme.secondary}
    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={{ height: inputHeight, minHeight: 44, maxHeight: 135, borderWidth: 1, borderColor: focus ? theme.accent : theme.controlBorder, borderRadius: 12, color: theme.text, backgroundColor: theme.surface, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, lineHeight: 22.5, textAlignVertical: "top" }} />;
}
export function ChatThreadFileSummary({ attachment, detail }: { attachment: ChatAttachment; detail?: string }) {
  const theme = useHomeTheme();
  const status = attachment.status === "deleted" || attachment.status === "deleting" ? "원본 삭제됨 · 다운로드 불가" : "원본 보관 중";
  return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}><Feather name="file-text" size={20} color={theme.secondary} accessible={false} aria-hidden />
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 1 }}><Text selectable style={[{ color: theme.text, fontSize: 14, lineHeight: 20.3, fontWeight: "700" }, Platform.OS === "web" ? { wordBreak: "break-all" } as unknown as TextStyle : undefined]}>{attachment.originalName}</Text>
      <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 17.4 }}>{attachmentFileSize(attachment.size).replace(/\.0MB$/, "MB")} · {status}{detail ? ` · ${detail}` : ""}</Text></View></View>;
}
export function ChatThreadSelectedFile({ name, size }: { name: string; size: number }) {
  const theme = useHomeTheme();
  return <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceMuted, flexDirection: "row", gap: 8 }}>
    <Feather name="paperclip" size={16} color={theme.secondary} accessible={false} aria-hidden />
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}><Text selectable style={{ color: theme.text, fontSize: 13, lineHeight: 19, fontWeight: "500" }}>{name}</Text><Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 17 }}>{attachmentFileSize(size)}</Text></View>
  </View>;
}
export function ChatThreadMessage({ item, own, peerName, children }: { item: ChatMessage; own: boolean; peerName?: string; children?: ReactNode }) {
  const theme = useHomeTheme();
  const { width } = useWindowDimensions();
  const fileOnly = !!item.attachment && (!item.body || item.body === `파일: ${item.attachment.originalName}`);
  const bubbleWidth = Math.min(560, (Math.min(width, 760) - 32) * .82);
  return <View role="listitem" accessibilityLabel={`${own ? "내가" : peerName ?? "상대방"} 보낸 메시지, ${formatChatTimestamp(item.createdAt)}`} style={{ width: "100%", alignItems: own ? "flex-end" : "flex-start", gap: 4 }}>
    {/* Native Yoga cannot infer an auto-width card from a flexing filename row. */}
    <View style={{ width: item.attachment ? bubbleWidth : undefined, maxWidth: bubbleWidth, borderWidth: fileOnly ? 0 : 1, borderColor: own ? theme.accentSoft : theme.border, borderRadius: 16, borderBottomLeftRadius: own ? 16 : 4, borderBottomRightRadius: own ? 4 : 16, backgroundColor: fileOnly ? "transparent" : own ? theme.accentSoft : theme.surface, paddingVertical: fileOnly ? 0 : 9, paddingHorizontal: fileOnly ? 0 : 12, gap: 8 }}>
      {item.body && !fileOnly ? <Text selectable style={{ color: theme.text, fontSize: 15, lineHeight: 22.5 }}>{item.body}</Text> : null}{children}
    </View><Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 16.8, fontVariant: ["tabular-nums"] }}>{formatChatTimestamp(item.createdAt)}{own ? item.readAt ? " · 읽음" : " · 안 읽음" : ""}</Text>
  </View>;
}
export function ChatThreadLoading() {
  const theme = useHomeTheme();
  return <View accessibilityLabel="대화 확인 중" accessibilityLiveRegion="polite" style={{ padding: 16, gap: 20 }}><Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>대화 확인 중</Text>
    <View accessible={false} aria-hidden style={{ gap: 20 }}>{[68, 54, 74].map((width, index) => <View key={index} style={{ width: `${width}%`, height: 60, alignSelf: index % 2 ? "flex-end" : "flex-start", borderRadius: 16, backgroundColor: theme.surfaceMuted }} />)}</View></View>;
}
const styles = StyleSheet.create({ action: { maxWidth: "100%", minWidth: 44, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 } });
