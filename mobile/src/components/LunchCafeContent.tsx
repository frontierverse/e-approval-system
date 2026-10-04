import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { AccountFeedback } from './account-feedback';
import { TextAction } from './ui';
import { useTheme } from '@/lib/theme';
export function LunchCafeRow({ title, description, onPress, disabled = false, label }: { title: string; description?: string; onPress?: () => void; disabled?: boolean; label?: string }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  const content = <><Text style={{ color: theme.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>{title}</Text>{description ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 18, flexShrink: 1 }}>{description}</Text> : null}</>;
  const style = { minHeight: 44, paddingVertical: 10, paddingHorizontal: 10, gap: 4, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface, borderWidth: 2, borderColor: focused ? theme.accent : 'transparent', opacity: disabled ? 0.6 : 1 };
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={style}>{content}</Pressable> : <View style={style}>{content}</View>;
}
export function LunchCafeField({ label, value, onChange, error, hint, disabled, multiline, maxLength, keyboardType, placeholder }: { label: string; value: string; onChange(value: string): void; error?: string; hint?: string; disabled?: boolean; multiline?: boolean; maxLength?: number; keyboardType?: KeyboardTypeOptions; placeholder?: string }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  return <View style={{ gap: 5, marginTop: 12 }}>
    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    {hint ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 18 }}>{hint}</Text> : null}
    <TextInput accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} value={value} onChangeText={onChange} editable={!disabled} multiline={multiline} maxLength={maxLength} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={theme.muted} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ minHeight: multiline ? 112 : 48, borderWidth: 1.5, borderColor: error ? theme.danger : focused ? theme.accent : theme.muted, borderRadius: 6, padding: 10, backgroundColor: theme.surface, color: theme.text, fontSize: 15, textAlignVertical: multiline ? 'top' : 'center' }} />
    {error ? <Text style={{ color: theme.danger, fontSize: 12 }}>{error}</Text> : null}
  </View>;
}
export function LunchCafeHeading({ title, actions }: { title: string; actions?: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, flexWrap: 'wrap' }}><Text accessibilityRole="header" aria-level={2} style={{ fontSize: 19, fontWeight: '700', color: theme.text }}>{title}</Text>{actions}</View>;
}
export function LunchCafeReadState({ loading, error, hasData, retry }: { loading: boolean; error: string | null; hasData: boolean; retry(): void }) {
  const theme = useTheme();
  return <>
    {loading && !hasData ? <View style={{ minHeight: 72, justifyContent: 'center', gap: 8 }}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.secondary }}>불러오는 중</Text></View> : null}
    <AccountFeedback error={error} />
    {error || !loading && !hasData ? <TextAction label="다시 조회" onPress={retry} disabled={loading} /> : null}
    {hasData && (loading || error) ? <Text style={{ color: theme.secondary, fontSize: 12, marginVertical: 4 }}>{loading ? '이전 조회 결과 · 갱신 중' : '이전 조회 결과 · 갱신하지 못함'}</Text> : null}
  </>;
}
export function LunchCafePager({ page, totalPages, disabled, onPage }: { page: number; totalPages: number; disabled: boolean; onPage(page: number): void }) {
  const theme = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 8 }}><TextAction label="이전 페이지" disabled={disabled || page <= 1} onPress={() => onPage(page - 1)} /><Text style={{ color: theme.secondary, fontSize: 13 }}>{page.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')}</Text><TextAction label="다음 페이지" disabled={disabled || page >= totalPages} onPress={() => onPage(page + 1)} /></View>;
}
export function CafeChoices<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange(value: T): void; disabled?: boolean }) {
  return <View accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{options.map(item => <TextAction key={item.value} label={item.label} accessibilityState={{ selected: value === item.value }} disabled={disabled} onPress={() => onChange(item.value)} />)}</View>;
}
