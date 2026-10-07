import { Feather } from "@expo/vector-icons";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { focusAccountNotice } from "./account-feedback";
import { DetailText as Text } from "./document-detail-ui";
import { useHomeTheme } from "@/lib/home-theme";

export function AppUpdatesStatusTitle({ ready, children }: { ready: boolean; children: string }) {
  const theme = useHomeTheme(), title = useRef<View>(null);
  useFocusEffect(useCallback(() => { if (ready) focusAccountNotice(title.current); }, [ready]));
  return <View ref={title} accessible tabIndex={-1} accessibilityLiveRegion="polite">
    <Text style={{ color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: "700" }}>{children}</Text>
  </View>;
}

export function AppUpdatesSection({ title, extra, children }: { title: string; extra?: string; children: ReactNode }) {
  const theme = useHomeTheme();
  return <View style={{ gap: 6 }}>
    <View style={{ marginHorizontal: 4, flexDirection: "row", flexWrap: "wrap", justifyContent: title === "현재 상태" ? "space-between" : "flex-start", alignItems: "baseline", columnGap: title === "현재 상태" ? 12 : 8 }}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: theme.secondary, fontSize: 13, lineHeight: 18, fontWeight: "700" }}>{title}</Text>
      {extra ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 17 }}>{extra}</Text> : null}
    </View>{children}
  </View>;
}
export function AppUpdatesRow({ label, labelWidth, children, first, muted }: { label: string; labelWidth: number | "100%"; children: string; first?: boolean; muted?: boolean }) {
  const theme = useHomeTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: theme.border }}>
    <Text style={{ flexBasis: labelWidth, flexShrink: 0, color: theme.secondary, fontSize: 13, lineHeight: 20 }}>{label}</Text>
    <Text selectable style={{ flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0, color: muted || children === "확인 기록 없음" ? theme.secondary : theme.text, fontSize: 14, lineHeight: 21, fontWeight: "500", fontVariant: ["tabular-nums"] }}>{children}</Text>
  </View>;
}
export function AppUpdatesAction({ label, onPress, disabled, busy, secondary, icon = "refresh-cw" }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean; icon?: "refresh-cw" | "clock" }) {
  const theme = useHomeTheme(), [focused, setFocused] = useState(false);
  const color = secondary ? theme.accent : busy ? theme.text : "#FFFFFF";
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, busy: !!busy }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.action, secondary && styles.secondary, { backgroundColor: secondary ? "transparent" : busy ? theme.surfaceMuted : theme.actionFill,
      borderColor: focused ? theme.accent : secondary ? "transparent" : busy ? theme.border : theme.actionFill, borderWidth: focused ? 2 : 1, opacity: pressed && !disabled ? .8 : 1 }]}>
    {busy ? <View accessible={false} aria-hidden><ActivityIndicator size="small" color={color} /></View> : secondary ? <Feather name={icon} size={15} color={color} accessible={false} aria-hidden /> : null}
    <Text style={{ flexShrink: 1, color, fontSize: secondary ? 14 : 15, lineHeight: 21, fontWeight: "700", textAlign: "center" }}>{label}</Text>
  </Pressable>;
}
export function AppUpdatesProgress({ progress }: { progress: number | null }) {
  const theme = useHomeTheme();
  if (progress === null) return <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
    <View accessible={false} aria-hidden><ActivityIndicator size="small" color={theme.secondary} /></View><Text style={{ flex: 1, color: theme.secondary, fontSize: 13, lineHeight: 19 }}>진행률 확인 중 · 숫자는 확인되면 표시돼요</Text>
  </View>;
  const pct = Math.floor(progress * 100);
  return <View accessibilityRole="progressbar" accessibilityLabel="업데이트 다운로드 진행률" accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct}%` }} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}%`} style={{ gap: 6 }}>
    <View accessible={false} aria-hidden style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.controlBorder }}>
      <View style={{ height: 8, marginTop: -1, marginLeft: -1, width: `${progress * 100}%`, borderRadius: 4, backgroundColor: theme.accent }} />
    </View>
    <Text accessible={false} aria-hidden style={{ color: theme.text, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{pct}%</Text>
  </View>;
}
export function AppUpdatesNotice({ kind, children }: { kind: "error" | "emergency" | "storage"; children: string }) {
  const theme = useHomeTheme(), notice = useRef<View>(null);
  const error = kind === "error" ? children : null;
  useFocusEffect(useCallback(() => { if (error) focusAccountNotice(notice.current); }, [error]));
  return <View ref={notice} accessible tabIndex={kind === "error" ? -1 : undefined} accessibilityRole={kind === "error" ? "alert" : undefined} accessibilityLiveRegion={kind === "storage" ? "polite" : undefined}
    style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: kind === "storage" ? theme.accentSoft : theme.dangerSoft }}>
    <Feather name={kind === "emergency" ? "alert-triangle" : kind === "storage" ? "info" : "alert-circle"} size={16} color={kind === "storage" ? theme.accent : theme.danger} accessible={false} aria-hidden style={{ marginTop: 2 }} />
    <Text style={{ flex: 1, color: theme.text, fontSize: 13, lineHeight: 20 }}>{children}</Text>
  </View>;
}
const styles = StyleSheet.create({
  action: { minHeight: 48, minWidth: 44, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondary: { alignSelf: "flex-start", minHeight: 44, paddingVertical: 0, paddingHorizontal: 4, gap: 6 },
});
