export type ProfilePushState = {
  native: boolean;
  pushStatus: { enabled: boolean } | null;
  pushLoading: boolean;
  pushPending: boolean;
  pushError: string | null;
  pushNeedsSettings: boolean;
  pushFailedMode: "auto" | "enable" | "disable" | null;
};
export type ProfilePushAction = { kind: "enable" | "disable" | "retry" | "settings"; label: string; primary?: boolean };

export function profileChatState(count: number | null, error: string | null) {
  if (count === null) return { text: error ? "확인 필요" : "확인 중", label: `직원 채팅, 안 읽음 수 ${error ? "확인 필요" : "확인 중"}`, badge: false, error: !!error };
  return { text: count > 0 ? `안 읽음 ${count > 99 ? "99+" : count}개` : "", label: count > 0 ? `직원 채팅, 안 읽음 ${count}개` : "직원 채팅", badge: count > 0, error: false };
}

export function profilePushState(state: ProfilePushState) {
  const { native, pushStatus: status, pushLoading: loading, pushPending: pending, pushError: error, pushNeedsSettings: settings, pushFailedMode: failed } = state;
  const actions: ProfilePushAction[] = [];
  if (!native) return { title: "설치한 모바일 앱에서 설정할 수 있습니다.", description: "브라우저에서는 기기 알림을 켜거나 끌 수 없어요.", icon: "bell-off" as const, tone: "neutral" as const, actions };
  if (!status && !error && (loading || pending)) return { title: "알림 설정 확인 중…", description: "", icon: "clock" as const, tone: "neutral" as const, actions };
  let title = status ? status.enabled ? "켜짐" : "꺼짐" : error ? "알림 설정을 확인하지 못했어요" : "알림 설정 확인 중…";
  let description = status ? status.enabled ? "이 기기·이 로그인에서 결재·채팅·할 일·일정 알림을 받아요." : "이 기기·이 로그인에서는 업무 푸시 알림을 받지 않아요." : "";
  if (settings) {
    title = status?.enabled ? "등록 켜짐 · 기기 알림 권한 꺼짐" : status ? "꺼짐 · 기기 알림 권한이 꺼져 있어요" : "등록 미확인 · 기기 알림 권한 꺼짐";
    description = status?.enabled ? "이 로그인의 등록은 켜져 있지만 알림이 오지 않을 수 있어요." : "권한을 허용하기 전에는 이 기기에 등록할 수 없어요.";
    actions.push({ kind: "settings", label: "기기 알림 설정 열기" }, { kind: "retry", label: pending ? "설정 중…" : "알림 등록 다시 시도" });
    if (status?.enabled) actions.push({ kind: "disable", label: pending ? "변경 중…" : "이 기기 알림 끄기" });
  } else if (error || failed) {
    if (status?.enabled) description = "알림 등록이 켜져 있어요. 오류를 확인하고 다시 시도하세요.";
    actions.push({ kind: "retry", label: pending ? failed === "disable" ? "해제 중…" : "확인 중…" : failed === "disable" ? "알림 끄기 다시 시도" : failed === "enable" ? "알림 등록 다시 시도" : "알림 설정 다시 시도" });
  } else if (status?.enabled) actions.push({ kind: "disable", label: pending ? "해제 중…" : "이 기기 알림 끄기" });
  else if (status) actions.push({ kind: "enable", label: pending ? "설정 중…" : "이 기기에서 알림 받기", primary: true });
  return { title, description, icon: settings || status?.enabled === false ? "bell-off" as const : status ? "bell" as const : error ? "alert-circle" as const : "clock" as const, tone: settings ? "neutral" as const : error && !status ? "error" as const : status?.enabled ? "active" as const : "neutral" as const, actions };
}
