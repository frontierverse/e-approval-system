/* Scope cleanup effects intentionally depend on the permission snapshot or token; render-created action callbacks would retrigger them and discard dirty input. */
/* eslint-disable react-hooks/exhaustive-deps */
/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { formatYouthDate, isYouthBasicDetail, isYouthDate, youthId } from '@/lib/youth';
import type { YouthBasic } from '@/types/youth';
import { AccountFeedback } from './account-feedback';
import { PrimaryButton, TextAction } from './ui';
import { useYouthMutation } from './youth-mutation';
import { YouthField, useYouthSnapshot, youthStyles as s } from './youth-ui';
import { YouthMutationActions, useYouthLeave } from './youth-write-ui';
export function YouthExtensionScreen({id}:{id:string}){const {token,user}=useSession();return token&&user?<Extension key={`${token}:${id}`} id={id}/>:<Redirect href="/login"/>;}
function Extension({id}:{id:string}) {
 const theme=useTheme(),insets=useSafeAreaInsets(),snapshot=useYouthSnapshot(youthId(id)?`/youth/${id}`:null,(v):v is import('@/types/youth').YouthBasicDetail=>isYouthBasicDetail(v,id));
 const [date,setDate]=useState(''),[reason,setReason]=useState(''),[base,setBase]=useState<YouthBasic|null>(null),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);const original=useRef(''),latestRead=useRef<YouthBasic|null>(null);
 const current=()=>snapshot.current()&&snapshot.verifiedRef.current&&!!snapshot.cached.current?.permissions.canManageYouth&&!!snapshot.cached.current?.permissions.canViewYouthDetails;
 const clear=()=>{setDate('');setReason('');setBase(null);latestRead.current=null;};
 const mutation=useYouthMutation({current,resultGuard:isYouthBasicDetail,onLoss:()=>{clear();snapshot.purge();},onSuccess:v=>{original.current=JSON.stringify([date,reason]);setNotice('퇴소연장 저장이 확정되었습니다.');if(v.result)setBase(v.result.youth);void snapshot.load();}});
 useEffect(()=>{if(snapshot.data){if(!current()){clear();return;}if(!base){setBase(snapshot.data.youth);setDate(snapshot.data.youth.dischargeDate??'');original.current=JSON.stringify([snapshot.data.youth.dischargeDate??'','']);}}},[snapshot.data]);
 useEffect(()=>{if(snapshot.revoked)clear();},[snapshot.revoked]);
 const confirmation=useYouthLeave(JSON.stringify([date,reason])!==original.current||mutation.state!=='idle'||mutation.busy,snapshot.current,()=>mutation.busyRef.current);
 const change=(fn:(v:string)=>void,v:string)=>{if(current()&&!mutation.locked){fn(v);setError(null);mutation.clearValidation();}};
 const save=async()=>{if(!current()||mutation.locked||!base)return;if(!isYouthDate(date)||!base.dischargeDate||date<=base.dischargeDate){setError('연장일은 현재 예정퇴소일보다 뒤인 YYYY-MM-DD로 입력하세요.');return;}if(!reason.trim()||reason.trim().length>500){setError('연장 사유를 1~500자로 입력하세요.');return;}await mutation.submit({operation:'profile.extend',targetId:id,path:`/youth/${id}/extensions`,method:'POST',body:{expectedUpdatedAt:base.updatedAt,extendedDischargeDate:date,reason:reason.trim()}});};
 const refresh=async()=>{await snapshot.load();if(current())latestRead.current=snapshot.cached.current!.youth;};
 const adopt=async()=>{const fresh=latestRead.current;if(!fresh||snapshot.cached.current?.youth!==fresh||!current())return;const yes=await confirmation.ask({title:'최신 퇴소일 기준',message:`최신 예정퇴소일 ${formatYouthDate(fresh.dischargeDate)}을 기준으로 내 입력을 유지합니다.`,confirm:'최신 기준 선택'});if(yes&&current()&&snapshot.cached.current?.youth===fresh&&mutation.useLatest()){setBase(fresh);setError(null);}};
 return <KeyboardAvoidingView style={[s.screen,{backgroundColor:theme.background}]} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content}><AccountFeedback error={snapshot.error||mutation.error||error} message={notice}/>{snapshot.loading?<ActivityIndicator color={theme.accent}/>:null}{snapshot.data&&current()?<><Text accessibilityRole="header" aria-level={2} style={[s.heading,{color:theme.text}]}>{snapshot.data.youth.name} 퇴소연장</Text><Text style={[s.body,{color:theme.secondary}]}>현재 예정퇴소일 {formatYouthDate(base?.dischargeDate??null)}</Text><YouthField label="연장 예정퇴소일" value={date} placeholder="YYYY-MM-DD" disabled={mutation.locked} onChange={v=>change(setDate,v)}/><YouthField label="연장 사유" value={reason} multiline hint="500자 이내" disabled={mutation.locked} onChange={v=>change(setReason,v)}/></>:!snapshot.loading?<Text style={[s.body,{color:theme.secondary}]}>현재 상세 열람과 관리 권한을 확인할 수 없습니다.</Text>:null}<YouthMutationActions mutation={mutation} onRefresh={refresh} onAdopt={()=>void adopt()}/><TextAction label="권한과 정보 다시 확인" onPress={()=>void snapshot.load()}/></ScrollView>{snapshot.data&&current()?<View style={[s.bar,{backgroundColor:theme.surface,borderColor:theme.border,paddingBottom:Math.max(8,insets.bottom)}]}><PrimaryButton title="퇴소연장 저장" disabled={mutation.locked} onPress={()=>void save()}/></View>:null}{confirmation.dialog}</KeyboardAvoidingView>;
}
