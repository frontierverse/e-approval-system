import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { ScheduleField, WorkScheduleRowLink, WorkScheduleSummary } from "@/components/work-schedule-content";
import { TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatScheduleDate, formatScheduleMinute, formatScheduleMonth, isScheduleDate, isScheduleMonth, isSchedulePage, scheduleCalendar, scheduleCounts, scheduleSourceLabel, selectedScheduleItems, shiftScheduleDate, shiftScheduleMonth } from "@/lib/schedules";
import { useTheme } from "@/lib/theme";
import type { MobileScheduleItem, MobileSchedulePage } from "@/lib/types";

export function WorkSchedulesScreen({ date, month }: { date?: string; month?: string }) {
  const { token } = useSession();
  const key = `${token}:${month ?? "current"}:${date ?? "default"}`;
  const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]);
  const isCurrentAccount = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <WorkSchedulesScreenContent key={key} date={date} month={month} isCurrentAccount={isCurrentAccount} /> : null;
}

function WorkSchedulesScreenContent({ date, month, isCurrentAccount }: { date?: string; month?: string; isCurrentAccount: () => boolean }) {
  const { request } = useSession(); const theme = useTheme();
  const [data, setData] = useState<MobileSchedulePage | null>(null);
  const [loading, setLoading] = useState(true); const [privatePending, setPrivatePending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState(date ?? ""); const [conditions, setConditions] = useState(false);
  const alive = useRef(true); const focused = useRef(false); const generation = useRef(0);
  const locked = useRef(false); const verified = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; }; }, [invalidate]);
  const canAct = () => alive.current && focused.current && !locked.current && isCurrentAccount();
  const load = useCallback(async () => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    if ((date !== undefined && !isScheduleDate(date)) || (month !== undefined && !isScheduleMonth(month)) || (date !== undefined && month !== undefined && date.slice(0, 7) !== month)) {
      setData(null); setLoading(false); setConditions(true); setError("날짜는 YYYY-MM-DD, 월은 YYYY-MM 형식이며 같은 월이어야 합니다. 다른 날짜로 자동 변경하지 않습니다."); return;
    }
    const op = ++generation.current; locked.current = true; setLoading(true); setError(null);
    const query = [month === undefined ? "" : `month=${encodeURIComponent(month)}`, date === undefined ? "" : `date=${encodeURIComponent(date)}`].filter(Boolean).join("&");
    try {
      const response = await request<MobileSchedulePage>(`/schedules${query ? `?${query}` : ""}`);
      if (!alive.current || !focused.current || generation.current !== op || !isCurrentAccount()) return;
      if (!isSchedulePage(response, { date, month })) throw new ApiError("일정 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      setData(response); setDateInput(response.selectedDate); verified.current = true; setPrivatePending(false);
    } catch (cause) {
      if (!alive.current || !focused.current || generation.current !== op || !isCurrentAccount()) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { verified.current = false; setPrivatePending(true); setData(null); }
      setError(cause instanceof Error ? cause.message : "일정을 불러오지 못했습니다. 다시 시도하세요."); setConditions(true);
    } finally {
      if (generation.current === op) { locked.current = false; if (alive.current && focused.current && isCurrentAccount()) setLoading(false); }
    }
  }, [date, month, isCurrentAccount, request]);
  useFocusEffect(useCallback(() => {
    focused.current = true; verified.current = false; setPrivatePending(true); void load();
    return () => { focused.current = false; verified.current = false; generation.current++; locked.current = false; setPrivatePending(true); };
  }, [load]));
  const changeDate = (next = dateInput, fromRecord = false) => {
    if (!canAct() || (fromRecord && !verified.current)) return;
    if (!isScheduleDate(next)) { setError("날짜를 YYYY-MM-DD 형식으로 입력하세요."); return; }
    if (next === data?.selectedDate && !error) return;
    router.setParams({ date: next, month: next.slice(0, 7) });
  };
  const navigate = (target: Parameters<typeof router.push>[0]) => { if (canAct() && verified.current) router.push(target); };
  const visible = privatePending ? null : data;
  const previousDate = visible ? shiftScheduleDate(visible.selectedDate, -1) : null;
  const nextDate = visible ? shiftScheduleDate(visible.selectedDate, 1) : null;
  const previousMonth = visible ? shiftScheduleMonth(visible.month, -1) : null;
  const nextMonth = visible ? shiftScheduleMonth(visible.month, 1) : null;
  const changeMonth = (next: string | null) => { if (next && visible) changeDate(next === visible.today.slice(0, 7) ? visible.today : `${next}-01`, true); };
  const items = visible ? selectedScheduleItems(visible.items, visible.selectedDate) : [];
  return <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.accent} />}>
    <View style={styles.actions}>
      <TextAction label={visible ? `${visible.selectedDate} 날짜 선택` : "날짜 선택"} icon="calendar-outline" disabled={loading} accessibilityState={{ expanded: conditions }} onPress={() => { if (canAct()) setConditions(value => !value); }} />
      {visible ? <TextAction label="등록" icon="add" disabled={loading} onPress={() => navigate({ pathname: "/work-schedules/edit", params: { date: visible.selectedDate } })} /> : <TextAction label="새로고침" icon="refresh" disabled={loading} onPress={() => void load()} />}
    </View>
    {conditions ? <View style={styles.group}>
      <ScheduleField name="date" label="조회 날짜" value={dateInput} placeholder="YYYY-MM-DD" disabled={loading} onChange={(_, value) => { if (canAct()) setDateInput(value); }} />
      <View style={styles.actions}><TextAction label="날짜 조회" disabled={loading} onPress={() => changeDate()} />{visible ? <TextAction label="오늘" disabled={loading} onPress={() => changeDate(visible.today, true)} /> : null}</View>
      {visible ? <>
        <View style={styles.monthActions}><TextAction label="이전 월" icon="chevron-back" disabled={loading || !previousMonth} onPress={() => changeMonth(previousMonth)} /><Text style={[styles.heading, { color: theme.text }]}>{formatScheduleMonth(visible.month)}</Text><TextAction label="다음 월" icon="chevron-forward" disabled={loading || !nextMonth} onPress={() => changeMonth(nextMonth)} /></View>
        <WorkScheduleSummary counts={visible.monthCounts} label="이달 전체 일정" />
        <ScheduleCalendar month={visible.month} today={visible.today} selectedDate={visible.selectedDate} items={visible.items} disabled={loading} onSelect={value => changeDate(value, true)} />
      </> : null}
    </View> : null}
    <AccountFeedback error={error} />
    {loading && !visible ? <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="일정 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.secondary }}>일정 불러오는 중...</Text></View> : null}
    {visible ? <>
      <WorkScheduleSummary counts={visible.selectedCounts} label={`${visible.selectedDate} 일정`} />
      <View style={styles.group}>
        <View style={styles.dayActions}><Text accessibilityRole="header" aria-level={2} style={[styles.heading, { color: theme.text }]}>선택일 일정 {items.length}건</Text><View style={styles.actions}><TextAction label="이전 날짜" icon="chevron-back" disabled={loading || !previousDate} onPress={() => previousDate && changeDate(previousDate, true)} /><TextAction label="다음 날짜" icon="chevron-forward" disabled={loading || !nextDate} onPress={() => nextDate && changeDate(nextDate, true)} /></View></View>
        {items.length ? <View role="list" accessibilityLabel="선택일 업무 일정">{items.map(item => <View key={item.id} role="listitem" style={[styles.row, { borderColor: theme.border }]}>
          <Text style={[styles.small, { color: theme.secondary }]}>{item.allDay ? "종일" : `${formatScheduleMinute(item.startMinute)}–${formatScheduleMinute(item.endMinute)}`} · {scheduleSourceLabel(item)}</Text>
          <WorkScheduleRowLink title={item.content} numberOfLines={2} accessibilityLabel={`${item.allDay ? "종일" : `${formatScheduleMinute(item.startMinute)}부터 ${formatScheduleMinute(item.endMinute)}`} ${scheduleSourceLabel(item)} ${item.content.slice(0, 160)} ${item.readOnly ? "읽기 전용 상세" : "일정 상세·수정"}`} disabled={loading} onPress={() => navigate({ pathname: "/work-schedules/[id]", params: { id: item.id, date: item.scheduleDate } })} />
        </View>)}</View> : <Text style={[styles.small, { color: theme.secondary }]}>이 날짜에 등록된 일정이 없습니다.</Text>}
      </View>
      <View style={styles.actions}><TextAction label="새로고침" icon="refresh" disabled={loading} onPress={() => void load()} /><TextAction label="일정 변경 내역" icon="time-outline" disabled={loading} onPress={() => navigate({ pathname: "/work-schedules/history", params: { date: visible.selectedDate } })} /></View>
    </> : null}
  </ScrollView>;
}

function ScheduleCalendar({ month, today, selectedDate, items, disabled, onSelect }: { month: string; today: string; selectedDate: string; items: MobileScheduleItem[]; disabled: boolean; onSelect: (date: string) => void }) {
  const theme = useTheme(); const [width, setWidth] = useState(0);
  const days = scheduleCalendar(month);
  return <View style={styles.calendar} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {width >= 308 ? <>
      <View style={styles.week}>{["일", "월", "화", "수", "목", "금", "토"].map(day => <Text key={day} style={[styles.weekday, { color: theme.secondary }]}>{day}</Text>)}</View>
      {Array.from({ length: 6 }, (_, week) => <View key={week} style={styles.week}>{days.slice(week * 7, week * 7 + 7).map((day, index) => {
        const counts = day.date && day.inMonth ? scheduleCounts(selectedScheduleItems(items, day.date)) : null;
        return <ScheduleDay key={day.date ?? `${week}-${index}`} date={day.date} today={today} selected={day.date === selectedDate} inMonth={day.inMonth} count={counts?.total ?? null} disabled={disabled || !day.date} onSelect={onSelect} />;
      })}</View>)}
    </> : null}
  </View>;
}
function ScheduleDay({ date, today, selected, inMonth, count, disabled, onSelect }: { date: string | null; today: string; selected: boolean; inMonth: boolean; count: number | null; disabled: boolean; onSelect: (date: string) => void }) {
  const theme = useTheme(); const [focused, setFocused] = useState(false);
  if (!date) return <View style={styles.day} />;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${formatScheduleDate(date)}${date === today ? " 오늘" : ""}${count === null ? " 다른 월" : ` 일정 ${count}건`}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onSelect(date)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.day, { borderColor: selected || focused ? theme.accent : "transparent", backgroundColor: selected || focused || pressed ? theme.accentSoft : "transparent", opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: selected ? theme.accent : inMonth ? theme.text : theme.secondary, fontSize: 14, lineHeight: 20, fontWeight: selected || date === today ? "700" : "400", textDecorationLine: date === today ? "underline" : "none" }}>{Number(date.slice(8))}</Text><Text style={[styles.dayCount, { color: theme.secondary }]}>{count === null ? "" : count ? `${count}건` : "·"}</Text></Pressable>;
}
const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 32, gap: 8, maxWidth: 960, width: "100%", alignSelf: "center" },
  group: { gap: 6 }, actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  dayActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  monthActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  heading: { fontSize: 15, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] },
  row: { minHeight: 64, gap: 2, paddingTop: 4, paddingBottom: 4, borderBottomWidth: 1 },
  loading: { minHeight: 64, flexDirection: "row", gap: 8, alignItems: "center" },
  calendar: { marginHorizontal: -6 }, week: { flexDirection: "row" }, weekday: { flex: 1, textAlign: "center", fontSize: 12, lineHeight: 20 },
  day: { flex: 1, minWidth: 44, minHeight: 48, paddingVertical: 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderRadius: 6 },
  dayCount: { fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] },
});
