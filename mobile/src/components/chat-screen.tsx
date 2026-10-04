import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { ChatBadge, ChatInput, ChatRowLink } from "@/components/chat-content";
import { EmptyState, TextAction } from "@/components/ui";
import { formatChatTimestamp } from "@/lib/chat";
import { useChat } from "@/lib/chat-provider";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
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
  const theme = useTheme();
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
  return <View style={{ flex: 1, backgroundColor: theme.background, width: "100%", maxWidth: 900, alignSelf: "center" }}>
  <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
   <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}><Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>{displayData ? `대화 ${displayData.conversations.length}개 · 안 읽음 ${providerError ? "확인 필요" : `${displayData.unreadCount}개`}` : "채팅 확인 중"}</Text><TextAction label="새 대화" icon="create-outline" disabled={!data || loading} onPress={() => {
    if (readyForAction()) {
      setDirectory(true);
      setSearch("");
    }
  }}/></View>
   {directory ? <ChatInput label="직원 검색" placeholder="이름·부서·직급 검색" value={search} onChange={value => {
    if (readyForAction())
      setSearch(value);
  }} disabled={!data}/> : null}
   <View style={{ flexDirection: "row", gap: 8 }}><TextAction label="대화 목록" disabled={!data} onPress={() => {
    if (readyForAction())
      setDirectory(false);
  }}/><TextAction label="직원 찾기" disabled={!data} onPress={() => {
    if (readyForAction())
      setDirectory(true);
  }}/><TextAction label="새로고침" icon="refresh" disabled={loading} onPress={() => void load(true)}/></View>
   <AccountFeedback error={error ?? providerError}/>
  </View>
  {loading && !data ? <ActivityIndicator style={{ padding: 20 }} color={theme.accent}/> : null}
  <FlatList data={rows} keyExtractor={row => row.peer.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} accessibilityRole="list" accessibilityLabel={directory ? "대화 가능한 직원" : "직원 대화 목록"} renderItem={({ item }) => <ChatRowLink disabled={loading} accessibilityLabel={`${item.peer.name}${item.peer.active ? "" : ", 현재 대화 기록만 확인 가능"}${item.conversation?.unreadCount ? `, 안 읽음 ${item.conversation.unreadCount}개` : ""}`} onPress={() => navigate(item.peer)}>
   <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Text style={{ color: theme.text, fontWeight: "700", fontSize: 15, flex: 1 }}>{item.peer.name}{!item.peer.active ? " · 기록" : ""}</Text><ChatBadge count={item.conversation?.unreadCount ?? 0}/></View>
   <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 13, marginTop: 3 }}>{item.conversation ? item.conversation.lastMessage.body || item.conversation.lastMessage.attachment?.originalName || "파일 메시지" : `${item.peer.departmentName} · ${item.peer.positionName}`}</Text>
   {item.conversation ? <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{formatChatTimestamp(item.conversation.lastMessage.createdAt)}</Text> : null}
  </ChatRowLink>} ListEmptyComponent={!loading && displayData ? <EmptyState title={term ? "검색 결과가 없습니다" : directory ? "대화 가능한 직원이 없습니다" : "아직 대화가 없습니다"} detail={directory ? "다른 검색어를 입력하세요." : "직원 찾기에서 새 대화를 시작하세요."}/> : null}/>
 </View>;
}
