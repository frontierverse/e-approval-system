import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { focusAccountNotice } from "@/components/account-feedback";
import { useYouth } from "@/components/youth-provider";
import { useChat } from "@/lib/chat-provider";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import { useNotifications } from "@/lib/notifications";
import { profileChatState, profilePushState, type ProfilePushAction, type ProfilePushState } from "@/lib/profile-state";
import { useSession } from "@/lib/session";
import type { MobileUser } from "@/lib/types";
import { useProfileLogout } from "@/lib/use-profile-logout";
import { useLunchCafe } from "@/providers/LunchCafeProvider";
import { useResources } from "@/providers/ResourceProvider";

type Icon = React.ComponentProps<typeof Feather>["name"];
type Destination = "/chat" | "/youth" | "/resources" | "/meal-menu" | "/work-logs" | "/work-schedules" | "/account" | "/app-updates";
const work: { label: string; icon: Icon; path: Destination }[] = [
  { label: "직원 채팅", icon: "message-circle", path: "/chat" },
  { label: "청소년 관리", icon: "users", path: "/youth" },
  { label: "자료실", icon: "folder", path: "/resources" },
  { label: "급식·카페", icon: "coffee", path: "/meal-menu" },
  { label: "업무일지", icon: "book-open", path: "/work-logs" },
  { label: "업무 일정", icon: "calendar", path: "/work-schedules" },
];
const settings: typeof work = [{ label: "계정·도장 설정", icon: "settings", path: "/account" }, { label: "앱 업데이트", icon: "download-cloud", path: "/app-updates" }];
const wrap = Platform.OS === "web" ? { wordBreak: "keep-all", overflowWrap: "anywhere" } as TextStyle : undefined;

export function ProfileScreen() {
  const { token, user } = useSession();
  return token && user ? <ProfileContent key={JSON.stringify([token, user.id])} user={user} /> : null;
}
function ProfileContent({ user }: { user: MobileUser }) {
  const { signOut } = useSession(), chat = useChat(), youth = useYouth(), resources = useResources(), meal = useLunchCafe();
  const push = useNotifications(), logout = useProfileLogout(signOut);
  const { refreshPushStatus } = push;
  useFocusEffect(useCallback(() => { void refreshPushStatus(); }, [refreshPushStatus]));
  const navigate = (path: Destination) => {
    if (path === "/chat" && !chat.isCurrentAccount() || path === "/youth" && !youth.isCurrentAccount() || path === "/resources" && !resources.isCurrentAccount() || path === "/meal-menu" && !meal.isCurrentAccount()) return;
    router.push(path);
  };
  const onPush = (kind: ProfilePushAction["kind"]) => {
    if (push.pushPending) return;
    void ({ enable: push.enablePush, disable: push.disablePush, retry: push.retryPushRegistration, settings: push.openPushSettings }[kind])();
  };
  return <ProfileHub user={user} chat={{ count: chat.unreadCount, error: chat.error }} push={{ native: Platform.OS !== "web", ...push }} logout={logout} navigate={navigate} onPush={onPush} />;
}

type HubProps = {
  user: MobileUser;
  chat: { count: number | null; error: string | null };
  push: ProfilePushState & { pushMessage: string | null };
  logout: ReturnType<typeof useProfileLogout>;
  navigate: (path: Destination) => void;
  onPush: (kind: ProfilePushAction["kind"]) => void;
};
export function ProfileHub({ user, chat, push, logout, navigate, onPush }: HubProps) {
  const theme = useTheme(), { width, fontScale } = useWindowDimensions();
  const large = fontScale >= 1.3 || width / fontScale < 300;
  const scroll = useRef<ScrollView>(null), feedback = useRef<View>(null), logoutButton = useRef<View>(null), cancelButton = useRef<View>(null);
  const pushY = useRef(0), wasConfirming = useRef(false);
  const chatState = profileChatState(chat.count, chat.error), pushState = profilePushState(push);
  useEffect(() => {
    if (push.native && (push.pushError || push.pushMessage)) {
      scroll.current?.scrollTo({ y: pushY.current, animated: false });
      focusAccountNotice(feedback.current);
    }
  }, [push.native, push.pushError, push.pushMessage]);
  useEffect(() => {
    if (!logout.confirming && wasConfirming.current) focusAccountNotice(logoutButton.current);
    wasConfirming.current = logout.confirming;
  }, [logout.confirming]);
  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={[styles.header, { borderBottomColor: theme.border }]}><Text accessibilityRole="header" aria-level={1} style={[styles.title, { color: theme.text }]}>내 정보</Text></View>
    <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View accessibilityLabel="로그인 계정" style={[styles.account, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View aria-hidden accessible={false} style={[styles.initial, { backgroundColor: theme.accentSoft }]}><Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700" }}>{user.name.charAt(0)}</Text></View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}><Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 17.4 }}>로그인 계정</Text>
          <View style={styles.identity}><Text style={[wrap, styles.name, { color: theme.text }]}>{user.name}</Text><Text style={[wrap, styles.position, { color: theme.secondary }]}>{user.positionName || "직원"}</Text></View>
        </View>
      </View>
      <Group title="업무 기능">{work.map((item, index) => <View role="listitem" key={item.path}><ProfileRow {...item} first={index === 0} onPress={() => navigate(item.path)} meta={index === 0 ? chatState : undefined} /></View>)}</Group>
      <Group title="계정·앱">{settings.map((item, index) => <View role="listitem" key={item.path}><ProfileRow {...item} first={index === 0} onPress={() => navigate(item.path)} /></View>)}</Group>
      <View style={styles.section} onLayout={event => { pushY.current = event.nativeEvent.layout.y; }}>
        <SectionTitle title="기기 알림" />
        <View style={[styles.pushPanel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.pushHeading}>
            <View aria-hidden accessible={false} style={[styles.pushIcon, { backgroundColor: pushState.tone === "active" ? theme.accentSoft : pushState.tone === "error" ? theme.dangerSoft : theme.surfaceMuted }]}>
              {push.pushPending && push.native && !push.pushStatus ? <ActivityIndicator size="small" color={theme.secondary} /> : <Feather name={pushState.icon} size={18} color={pushState.tone === "active" ? theme.accent : pushState.tone === "error" ? theme.danger : theme.secondary} />}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text accessibilityLiveRegion="polite" style={[wrap, styles.pushTitle, { color: theme.text }]}>{pushState.title}</Text>{pushState.description ? <Text style={[wrap, styles.detail, { color: theme.secondary }]}>{pushState.description}</Text> : null}</View>
          </View>
          {push.native && (push.pushError || push.pushMessage) ? <View ref={feedback} accessible tabIndex={-1} accessibilityRole={push.pushError ? "alert" : undefined} accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: push.pushError ? theme.dangerSoft : theme.accentSoft }]}><Feather aria-hidden accessible={false} name={push.pushError ? "alert-circle" : "check"} size={16} color={push.pushError ? theme.danger : theme.success} /><Text style={[wrap, styles.detail, { flex: 1, color: theme.text }]}>{push.pushError || push.pushMessage}</Text></View> : null}
          {pushState.actions.length ? <View accessibilityLabel="기기 알림 설정" style={styles.pushActions}>{pushState.actions.map(action => <ProfileAction key={action.kind} label={action.label} full={large} primary={action.primary} disabled={push.pushPending} pending={push.pushPending && action.kind !== "settings"} onPress={() => onPush(action.kind)} />)}</View> : null}
          <Text style={[wrap, styles.footnote, { color: theme.secondary }]}>{push.native ? "이 로그인 세션의 이 기기 등록만 바꿔요. OS 알림 권한은 기기 설정에서 따로 관리되고, 다른 기기 등록·결재 알림 읽음·채팅 수에는 영향이 없어요." : "모바일 앱의 기기 알림 상태와는 별개 화면이에요."}</Text>
        </View>
      </View>
      {logout.error ? <Text accessibilityRole="alert" style={[wrap, styles.detail, { color: theme.danger }]}>{logout.error}</Text> : null}
      <View style={[styles.group, { borderColor: theme.border, backgroundColor: theme.surface }]}><ProfileRow label={logout.busy ? "로그아웃 중…" : "로그아웃"} icon="log-out" first chevron={false} disabled={logout.confirming || logout.busy} onPress={() => { focusAccountNotice(logoutButton.current); logout.request(); }} buttonRef={logoutButton} /></View>
    </ScrollView>
    <Modal transparent animationType="none" visible={logout.confirming} onDismiss={() => { if (!logout.confirming) focusAccountNotice(logoutButton.current); }} onRequestClose={logout.cancel} onShow={() => focusAccountNotice(cancelButton.current)} accessibilityLabel="로그아웃 확인">
      <View style={styles.overlay}><View role="alertdialog" accessibilityLabel="로그아웃" accessibilityViewIsModal style={[styles.dialog, { backgroundColor: theme.surface }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flexShrink: 1 }}><Text accessibilityRole="header" aria-level={2} style={[wrap, { fontSize: 18, lineHeight: 25.2, fontWeight: "700", color: theme.text }]}>로그아웃</Text><Text style={[wrap, { fontSize: 15, lineHeight: 22.5, color: theme.text }]}>이 기기에서 로그아웃하시겠습니까?</Text><Text style={[wrap, styles.detail, { color: theme.secondary }]}>다른 기기의 로그인, 계정, 서버의 문서는 그대로예요.</Text></ScrollView>
        <View style={styles.dialogActions}><ProfileAction full={large} equal label="취소" disabled={logout.busy} onPress={logout.cancel} buttonRef={cancelButton} /><ProfileAction full={large} equal label={logout.busy ? "로그아웃 중…" : "로그아웃"} danger disabled={logout.busy} pending={logout.busy} onPress={() => void logout.confirm()} /></View>
      </View></View>
    </Modal>
  </SafeAreaView>;
}
function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return <Text accessibilityRole="header" aria-level={2} style={[styles.sectionTitle, { color: theme.secondary }]}>{title}</Text>;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={styles.section}><SectionTitle title={title} /><View role="list" accessibilityLabel={title} style={[styles.group, { borderColor: theme.border, backgroundColor: theme.surface }]}>{children}</View></View>;
}
function ProfileRow({ label, icon, first, onPress, meta, chevron = true, disabled = false, buttonRef }: { label: string; icon: Icon; first: boolean; onPress: () => void; meta?: ReturnType<typeof profileChatState>; chevron?: boolean; disabled?: boolean; buttonRef?: React.RefObject<View | null> }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  return <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={meta?.label || label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.row, { minHeight: first ? 48 : 49, borderTopWidth: first ? 0 : 1, borderTopColor: theme.border, backgroundColor: focused ? theme.accentSoft : pressed ? theme.surfaceMuted : "transparent", outlineColor: focused ? theme.accent : undefined, outlineWidth: focused ? 2 : 0, outlineOffset: -2, opacity: disabled ? 0.6 : 1 }]}>
    <Feather aria-hidden accessible={false} name={icon} size={20} color={theme.secondary} />
    <View style={styles.rowBody}><Text style={[wrap, styles.rowLabel, { color: theme.text }]}>{label}</Text>{meta?.text ? <Text aria-hidden accessible={false} style={[styles.meta, { color: meta.error ? theme.danger : meta.badge ? theme.accent : theme.secondary, backgroundColor: meta.badge ? theme.accentSoft : "transparent", paddingHorizontal: meta.badge ? 8 : 0, paddingVertical: meta.badge ? 2 : 0 }]}>{meta.text}</Text> : null}</View>
    {chevron ? <Feather aria-hidden accessible={false} name="chevron-right" size={18} color={theme.muted} /> : null}
  </Pressable>;
}
function ProfileAction({ label, full = false, equal = false, primary = false, danger = false, disabled = false, pending = false, onPress, buttonRef }: { label: string; full?: boolean; equal?: boolean; primary?: boolean; danger?: boolean; disabled?: boolean; pending?: boolean; onPress: () => void; buttonRef?: React.RefObject<View | null> }) {
  const theme = useTheme(), [focused, setFocused] = useState(false), filled = primary || danger;
  return <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: pending }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.action, { flexBasis: full ? "100%" : equal ? 0 : 140, backgroundColor: danger ? theme.dangerFill : primary ? theme.actionFill : focused || pressed ? theme.surfaceMuted : theme.surface, borderColor: focused ? theme.accent : danger ? theme.dangerFill : primary ? theme.actionFill : theme.controlBorder, opacity: disabled && !pending ? 0.5 : 1, outlineWidth: focused ? 2 : 0, outlineColor: theme.accent, outlineOffset: 2 }]}>{pending ? <ActivityIndicator size="small" color={filled ? "#FFFFFF" : theme.text} /> : null}<Text style={[wrap, styles.actionText, { color: filled ? "#FFFFFF" : theme.text }]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  header: { minHeight: 52, paddingVertical: 6, paddingHorizontal: 16, justifyContent: "center", borderBottomWidth: 1 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  content: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 20, gap: 12, width: "100%", maxWidth: 720, alignSelf: "center" },
  account: { borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  initial: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  identity: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8 },
  name: { fontSize: 17, lineHeight: 23.8, fontWeight: "700", flexShrink: 1 },
  position: { fontSize: 14, lineHeight: 19.6, flexShrink: 1 },
  section: { gap: 6 }, sectionTitle: { marginLeft: 4, fontSize: 13, lineHeight: 18.2, fontWeight: "700" },
  group: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  row: { minHeight: 48, paddingVertical: 6, paddingLeft: 14, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 8, rowGap: 2 },
  rowLabel: { fontSize: 15, lineHeight: 21, fontWeight: "500", flexShrink: 1 }, meta: { fontSize: 12, lineHeight: 17.4, fontWeight: "700", borderRadius: 999 },
  pushPanel: { borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  pushHeading: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, pushIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pushTitle: { fontSize: 15, lineHeight: 21, fontWeight: "700" }, detail: { fontSize: 13, lineHeight: 19.5 }, footnote: { fontSize: 12, lineHeight: 18 },
  feedback: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  pushActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexBasis: 140, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { fontSize: 14, lineHeight: 18.9, fontWeight: "700", flexShrink: 1, textAlign: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(17,21,27,0.48)", alignItems: "center", justifyContent: "center", padding: 16 },
  dialog: { width: "100%", maxWidth: 340, maxHeight: "100%", borderRadius: 18, padding: 20, gap: 14 }, dialogActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
