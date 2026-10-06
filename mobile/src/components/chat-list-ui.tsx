import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState, type Ref } from "react";
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { focusAccountNotice } from "./account-feedback";
import { DetailText as Text } from "./document-detail-ui";
import { formatChatTimestamp } from "@/lib/chat";
import { useHomeTheme } from "@/lib/home-theme";
import type { ChatConversation, ChatEmployee } from "@/lib/types";

export function ChatListAction({ label, accessibilityLabel, icon, iconOnly, primary, textOnly, disabled, busy, onPress }: {
  label: string; accessibilityLabel?: string; icon?: keyof typeof Feather.glyphMap; iconOnly?: boolean;
  primary?: boolean; textOnly?: boolean; disabled?: boolean; busy?: boolean; onPress: () => void;
}) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  const color = primary && !disabled ? "#FFFFFF" : disabled ? theme.secondary : textOnly ? theme.accent : theme.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled, busy: !!busy }} disabled={disabled}
    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onPress={onPress}
    style={({ pressed }) => [styles.action, iconOnly && styles.iconAction, { borderColor: focus ? theme.accent : primary ? disabled ? theme.border : theme.actionFill : iconOnly || textOnly ? "transparent" : theme.controlBorder,
      backgroundColor: primary ? disabled ? theme.surface : theme.actionFill : iconOnly || textOnly ? "transparent" : theme.surface,
      opacity: pressed && !disabled ? .8 : 1 }]}>
    {icon ? <Feather name={icon} size={iconOnly ? 22 : 16} color={color} accessible={false} aria-hidden /> : null}
    {!iconOnly ? <Text style={{ flexShrink: 1, color, fontSize: 14, lineHeight: 19, fontWeight: "700", textAlign: "center" }}>{label}</Text> : null}
  </Pressable>;
}

export function ChatListTabs({ directory, disabled, onChange }: { directory: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const theme = useHomeTheme(), [focus, setFocus] = useState<number | null>(null);
  return <View accessibilityLabel="목록 보기" style={[styles.tabs, { backgroundColor: theme.surfaceMuted, borderColor: theme.controlBorder }]}>
    {["대화 목록", "직원 찾기"].map((label, index) => {
      const selected = directory === (index === 1);
      return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} aria-pressed={selected} disabled={disabled}
        onFocus={() => setFocus(index)} onBlur={() => setFocus(null)} onPress={() => onChange(index === 1)}
        style={({ pressed }) => [styles.tab, { borderColor: selected || focus === index ? theme.accent : "transparent", backgroundColor: selected ? theme.surface : pressed ? theme.accentSoft : "transparent" }]}>
        <Text style={{ color: selected ? theme.text : theme.secondary, fontSize: 14, lineHeight: 19, fontWeight: selected ? "700" : "500", textAlign: "center" }}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

export function ChatListSearch({ value, onChange, onClear, disabled, inputRef }: {
  value: string; onChange: (value: string) => void; onClear: () => void; disabled: boolean; inputRef?: Ref<TextInput>;
}) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  return <View style={{ position: "relative", justifyContent: "center" }}>
    <TextInput ref={inputRef} accessibilityLabel="이름·부서·직급 검색" role="searchbox" value={value} onChangeText={onChange} editable={!disabled}
      placeholder="이름·부서·직급 검색" placeholderTextColor={theme.muted} returnKeyType="search" autoCorrect={false} autoCapitalize="none"
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={[styles.search, { borderColor: focus ? theme.accent : theme.controlBorder, backgroundColor: theme.surface, color: theme.text, paddingRight: value ? 44 : 12 }]} />
    <Feather name="search" size={18} color={theme.secondary} accessible={false} aria-hidden pointerEvents="none" style={{ position: "absolute", left: 12 }} />
    {value ? <View style={{ position: "absolute", right: 0 }}><ChatListAction label="검색어 지우기" icon="x-circle" iconOnly disabled={disabled} onPress={onClear} /></View> : null}
  </View>;
}

export function ChatListRow({ peer, conversation, directory, first, last, disabled, onPress }: {
  peer: ChatEmployee; conversation?: ChatConversation; directory: boolean; first: boolean; last: boolean; disabled: boolean; onPress: () => void;
}) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || width < 320;
  const unread = conversation?.unreadCount ?? 0;
  const meta = `${peer.departmentName} · ${peer.positionName}`;
  const time = conversation ? formatChatTimestamp(conversation.lastMessage.createdAt) : "";
  const message = conversation?.lastMessage;
  const preview = message ? message.body || message.attachment?.originalName || "파일 메시지" : "";
  const label = `${peer.name}${peer.active ? "" : " 기록, 현재 대화 기록만 확인 가능"}, ${peer.departmentName} ${peer.positionName}${unread ? `, 안 읽은 메시지 ${unread}개` : ""}${directory ? conversation ? ", 대화 열기" : ", 새 대화 시작" : `, ${time}, ${message?.body ? "" : message?.attachment ? "첨부파일 " : ""}${preview}`}`;
  const badge = unread > 0 ? <View style={{ minWidth: 22, minHeight: 22, borderRadius: 11, paddingHorizontal: 7, backgroundColor: theme.actionFill, justifyContent: "center", alignItems: "center" }}><Text style={{ color: "#FFFFFF", fontSize: 12, lineHeight: 18, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{unread > 99 ? "99+" : unread}</Text></View> : null;
  return <View style={{ borderColor: theme.border, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: last ? 1 : 0,
    borderTopLeftRadius: first ? 16 : 0, borderTopRightRadius: first ? 16 : 0, borderBottomLeftRadius: last ? 16 : 0, borderBottomRightRadius: last ? 16 : 0, overflow: "hidden", backgroundColor: theme.surface }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={({ pressed }) => [styles.row, { borderColor: focus ? theme.accent : "transparent", backgroundColor: pressed || focus ? theme.surfaceMuted : theme.surface }]}>
      <View accessible={false} aria-hidden style={{ gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 }}>
            <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: directory || unread ? "700" : "500", flexShrink: 1 }}>{peer.name}</Text>
            {!peer.active ? <View style={{ borderWidth: 1, borderColor: theme.controlBorder, borderRadius: 6, paddingHorizontal: 6 }}><Text style={{ color: theme.secondary, fontSize: 11, lineHeight: 17, fontWeight: "700" }}>기록</Text></View> : null}
            {!directory && !stacked ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 19, flexShrink: 1 }}>{meta}</Text> : null}
          </View>
          {!directory && !stacked ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 19, fontVariant: ["tabular-nums"], flexShrink: 0 }}>{time}</Text> : null}
          {directory ? badge : null}
        </View>
        {directory ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>{meta}</Text> : stacked ? <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 4 }}>
          <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 18, flexShrink: 1 }}>{meta} ·</Text>
          <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>{time.replaceAll(" ", "\u00a0")}</Text>
        </View> : null}
        {!directory ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!message?.body ? <Feather name="paperclip" size={14} color={theme.secondary} accessible={false} aria-hidden /> : null}
          <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, color: unread ? theme.text : theme.secondary, fontSize: 13, lineHeight: 20, fontWeight: unread ? "500" : "400" }}>{preview}</Text>{badge}
        </View> : null}
      </View>
    </Pressable>
  </View>;
}

export function ChatListNotice({ error, title, detail, onRetry, periodic = false }: { error?: string | null; title?: string; detail?: string; onRetry?: () => void; periodic?: boolean }) {
  const theme = useHomeTheme(), notice = useRef<View>(null);
  useEffect(() => { if (error) focusAccountNotice(notice.current); }, [error]);
  return <View ref={notice} tabIndex={error ? -1 : undefined} accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion={error ? undefined : "polite"}
    style={[styles.notice, periodic && { paddingVertical: 8, paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }, { backgroundColor: theme.surface, borderColor: periodic ? theme.danger : theme.border }]}>
    {periodic ? <Text style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, color: theme.secondary, fontSize: 13, lineHeight: 20 }}><Text style={{ color: theme.danger, fontWeight: "700" }}>{title}</Text> · {detail ?? error}</Text>
      : <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <Feather name={error ? "alert-circle" : "lock"} size={22} color={error ? theme.danger : theme.secondary} accessible={false} aria-hidden style={{ marginTop: 1 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text style={{ color: theme.text, fontSize: 16, lineHeight: 23, fontWeight: "700" }}>{title}</Text>
          <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>{detail ?? error}</Text></View>
      </View>}
    {onRetry ? <ChatListAction label="다시 불러오기" textOnly={periodic} onPress={onRetry} /> : null}
  </View>;
}

export function ChatListEmpty({ directory, noRecords, onFind, onClear }: { directory: boolean; noRecords: boolean; onFind: () => void; onClear: () => void }) {
  const theme = useHomeTheme();
  return <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={{ gap: 2 }}><Text style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: "700" }}>{noRecords ? directory ? "대화 가능한 직원이 없습니다" : "아직 대화가 없습니다" : "검색 결과가 없습니다"}</Text>
      <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>{noRecords ? directory ? "지금 대화를 시작할 수 있는 재직 직원이 없어요." : "직원 찾기에서 대화할 직원을 고를 수 있어요." : "이름·부서·직급으로 찾을 수 있어요. 메시지 내용은 검색하지 않아요."}</Text></View>
    {!noRecords || !directory ? <View style={{ alignSelf: "flex-start" }}><ChatListAction label={noRecords ? "직원 찾기" : "검색 지우기"} onPress={noRecords ? onFind : onClear} /></View> : null}
  </View>;
}

export function ChatListLoading() {
  const theme = useHomeTheme(), { fontScale } = useWindowDimensions();
  return <View accessible={false} aria-hidden style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 16, overflow: "hidden" }}>
    {[34, 42, 30, 38].map((width, index) => <View key={index} style={{ minHeight: 68 * Math.max(1, fontScale * .9), padding: 14, gap: 8, justifyContent: "center", borderTopWidth: index ? 1 : 0, borderTopColor: theme.border }}>
      <View style={{ width: `${width}%`, height: 13, borderRadius: 7, backgroundColor: theme.surfaceMuted }} />
      <View style={{ width: `${72 - index * 6}%`, height: 11, borderRadius: 6, backgroundColor: theme.surfaceMuted }} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  action: { minWidth: 44, minHeight: 44, borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  iconAction: { width: 44, paddingHorizontal: 0 },
  tabs: { padding: 3, gap: 4, borderWidth: 1, borderRadius: 12, flexDirection: "row" },
  tab: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1.5, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  search: { minHeight: 44, paddingLeft: 38, paddingVertical: 8, borderWidth: 1, borderRadius: 12, fontSize: 15, lineHeight: 21 },
  row: { minHeight: 68, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 2, justifyContent: "center" },
  notice: { padding: 16, borderWidth: 1, borderRadius: 16, gap: 10 },
});
