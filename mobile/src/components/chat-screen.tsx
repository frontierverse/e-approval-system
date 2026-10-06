import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DetailText as Text } from "@/components/document-detail-ui";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { ChatListAction, ChatListEmpty, ChatListLoading, ChatListNotice, ChatListRow, ChatListSearch, ChatListTabs } from "@/components/chat-list-ui";
import { useChat } from "@/lib/chat-provider";
import { useSession } from "@/lib/session";
import { useHomeTheme } from "@/lib/home-theme";
import type { ChatEmployee, ChatSummary } from "@/lib/types";
export function ChatScreen() {
  const { token } = useSession();
  const key = token ?? "";
  const scope = useRef(key);
  useLayoutEffect(() => {
    scope.current = key;
  }, [key]);
  const current = useCallback(() => !!token && scope.current === key, [token, key]);
  return token ? <ChatScreenContent key={key} isCurrentAccount={current}/> : null;
}
function ChatScreenContent({ isCurrentAccount }: {
  isCurrentAccount: () => boolean;
}) {
  const theme = useHomeTheme();
  const { bottom } = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const searchInput = useRef<TextInput>(null);
  const { refreshSummary, summary, error: providerError, isCurrentAccount: providerCurrent, foreground: appForeground, foregroundEpoch, isForegroundCurrent } = useChat();
  const [privacy, setPrivacy] = useState(true);
  const [verifiedRenderEpoch, setVerifiedRenderEpoch] = useState(-1);
  const [lastForegroundEpoch, setLastForegroundEpoch] = useState(foregroundEpoch);
  if (lastForegroundEpoch !== foregroundEpoch) { setLastForegroundEpoch(foregroundEpoch); setPrivacy(true); }
  const [data, setData] = useState<ChatSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [directory, setDirectory] = useState(false);
  const alive = useRef(false);
  const focused = useRef(false);
  const generation = useRef(0);
  const verified = useRef(false);
  const verifiedForeground = useRef(-1);
  const busy = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    alive.current = true;
    invalidate();
    return () => {
      alive.current = false;
      invalidate();
    };
  }, [invalidate]);
  const readyForAction = () => alive.current && focused.current && verified.current && verifiedForeground.current === foregroundEpoch && isCurrentAccount() && providerCurrent() && isForegroundCurrent(foregroundEpoch);
  const load = useCallback(async (fresh = false) => {
    if (busy.current || !focused.current || !isCurrentAccount() || !isForegroundCurrent(foregroundEpoch))
      return;
    const epoch = generation.current;
    busy.current = true;
    setLoading(true);
    if (fresh) {
      setError(null);
      verified.current = false;
      setPrivacy(true);
      setData(null);
    }
    try {
      const value = await refreshSummary();
      if (!alive.current || !focused.current || epoch !== generation.current || !isCurrentAccount() || !isForegroundCurrent(foregroundEpoch))
        return;
      if (value) {
        verified.current = true;
        verifiedForeground.current = foregroundEpoch;
        setVerifiedRenderEpoch(foregroundEpoch);
        setPrivacy(false);
        setData(value);
        setError(null);
      }
      else {
        setError("직원 채팅 목록을 확인하지 못했습니다. 다시 불러오세요.");
      }
    }
    finally {
      if (epoch === generation.current && isForegroundCurrent(foregroundEpoch)) {
        busy.current = false;
        if (alive.current && focused.current && isCurrentAccount())
          setLoading(false);
      }
    }
  }, [refreshSummary, isCurrentAccount, isForegroundCurrent, foregroundEpoch]);
  useLayoutEffect(() => { verified.current = false; busy.current = false; }, [foregroundEpoch]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    verified.current = false;
    void load(true);
    return () => {
      focused.current = false;
      verified.current = false;
      generation.current++;
      busy.current = false;
      setData(null);
    };
  }, [load]));
  useEffect(() => { if(appForeground && focused.current) void load(true); }, [appForeground, foregroundEpoch, load]);
  useLayoutEffect(() => { if (!summary && providerError) verified.current = false; }, [summary, providerError]);
  const displayData = privacy || !appForeground || verifiedRenderEpoch !== foregroundEpoch ? null : data && summary ? summary : data && providerError ? null : data;
  const navigate = (peer: ChatEmployee) => {
    if (readyForAction() && !busy.current)
      router.push({ pathname: "/chat/[peerId]", params: { peerId: peer.id } });
  };
  const term = search.trim().toLocaleLowerCase("ko-KR");
  const match = (peer: ChatEmployee) => `${peer.name} ${peer.departmentName} ${peer.positionName}`.toLocaleLowerCase("ko-KR").includes(term);
  const rows = displayData ? directory ? displayData.employees.filter(match).map(peer => ({ peer, conversation: displayData.conversations.find(c => c.peer.id === peer.id) })) : displayData.conversations.filter(c => match(c.peer)).map(conversation => ({ peer: conversation.peer, conversation })) : [];
  const canInteract = !!displayData && !loading && appForeground && verifiedRenderEpoch === foregroundEpoch;
  const changeDirectory = (value: boolean) => { if (readyForAction() && !busy.current) setDirectory(value); };
  const changeSearch = (value: string) => { if (readyForAction() && !busy.current) setSearch(value); };
  const clearSearch = () => { if (readyForAction() && !busy.current) { setSearch(""); searchInput.current?.focus(); } };
  const newChat = () => { if (readyForAction() && !busy.current) { setDirectory(true); setSearch(""); searchInput.current?.focus(); } };
  const showError = error ?? providerError;
  const noRecords = !!displayData && (directory ? displayData.employees.length : displayData.conversations.length) === 0;
  const large = width < 320 || fontScale >= 1.3;
  return <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.surface }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface }}>
      <View style={styles.heading}>
        <ChatListAction label={router.canGoBack() ? "직원 채팅 뒤로" : "뒤로, 내 정보"} icon="chevron-left" iconOnly onPress={() => {
          if (!isCurrentAccount() || !providerCurrent()) return;
          if (router.canGoBack()) router.back(); else router.replace("/profile");
        }} />
        <Text accessibilityRole="header" aria-level={1} style={{ flexGrow: 1, flexShrink: 1, flexBasis: large ? "70%" : 0, color: theme.text, fontSize: 17, lineHeight: 23, fontWeight: "700" }}>직원 채팅</Text>
        <View style={{ marginLeft: "auto", flexDirection: "row", gap: 4, alignItems: "center" }}>
          <ChatListAction label="새로고침" accessibilityLabel={loading ? "채팅 목록 확인 중" : "채팅 목록 새로고침"} icon="rotate-cw" iconOnly disabled={loading || !appForeground} busy={loading} onPress={() => void load(true)} />
          <ChatListAction label="새 대화" icon="plus" primary disabled={!canInteract} onPress={newChat} />
        </View>
      </View>
    </View>
    <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList data={rows} keyExtractor={row => row.peer.id} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, bottom + 16) }]} accessibilityRole="list"
        accessibilityLabel={`${directory ? "직원 목록" : "대화 목록"}${term && displayData ? `, 검색 결과 ${rows.length}${directory ? "명" : "개"}` : ""}`}
        ListHeaderComponent={<View style={{ gap: 12, marginBottom: 12 }}>
          {displayData ? <Text accessibilityLiveRegion="polite" style={{ marginHorizontal: 4, color: theme.secondary, fontSize: 14, lineHeight: 20 }}>
            대화 <Text style={{ color: theme.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{displayData.conversations.length}</Text>개 · 안 읽은 메시지 <Text style={{ color: providerError ? theme.danger : displayData.unreadCount ? theme.accent : theme.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{providerError ? "확인 필요" : `${displayData.unreadCount}개`}</Text>
          </Text> : loading ? <View accessibilityLiveRegion="polite" style={{ marginHorizontal: 4, flexDirection: "row", gap: 6, alignItems: "center" }}>
            <View accessible={false} aria-hidden><ActivityIndicator size="small" color={theme.secondary} /></View><Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 20 }}>채팅 확인 중</Text>
          </View> : null}
          <ChatListTabs directory={directory} disabled={!canInteract} onChange={changeDirectory} />
          <ChatListSearch value={search} disabled={!canInteract} inputRef={searchInput} onChange={changeSearch} onClear={clearSearch} />
          {term && displayData && rows.length ? <Text accessibilityLiveRegion="polite" style={{ marginHorizontal: 4, color: theme.secondary, fontSize: 12, lineHeight: 18 }}>‘{search.trim()}’ 검색 결과 · {directory ? `직원 ${rows.length}명` : `대화 ${rows.length}개`}</Text> : null}
          {displayData && showError ? <ChatListNotice error={showError} periodic title="최근 확인 실패" detail="마지막으로 확인한 목록이에요." onRetry={() => void load(true)} /> : null}
        </View>}
        renderItem={({ item, index }) => <ChatListRow peer={item.peer} conversation={item.conversation} directory={directory} first={index === 0} last={index === rows.length - 1} disabled={!canInteract} onPress={() => navigate(item.peer)} />}
        ListEmptyComponent={loading ? <ChatListLoading /> : displayData ? <ChatListEmpty directory={directory} noRecords={noRecords} onFind={() => changeDirectory(true)} onClear={clearSearch} />
          : showError ? <ChatListNotice error={showError} title="채팅 목록을 불러오지 못했어요" onRetry={() => void load(true)} />
          : !appForeground ? <ChatListNotice title="앱이 비활성 상태예요" detail="보안을 위해 채팅 내용을 가렸어요. 앱으로 돌아오면 다시 확인한 뒤 보여줘요." /> : null} />
    </KeyboardScreen>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  heading: { width: "100%", maxWidth: 760, alignSelf: "center", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, padding: 4, paddingRight: 12, minHeight: 52 },
  content: { paddingHorizontal: 16, paddingTop: 12, width: "100%", maxWidth: 760, alignSelf: "center" },
});
