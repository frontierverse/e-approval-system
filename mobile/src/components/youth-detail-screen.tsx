/* Scope cleanup effects intentionally depend on the permission snapshot or token; render-created action callbacks would retrigger them and discard dirty input. */

/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { registerYouthResource } from '@/lib/youth-privacy';
import { formatYouthDate, formatYouthTimestamp, isYouthBasicDetail, isYouthContactsView, isYouthDetailsView, newYouthRequestId, youthDisclosureCurrent, youthDisclosureDeadline, youthId, youthPrivateFailure, youthResponseError } from '@/lib/youth';
import type { YouthContactsView, YouthDetailsView } from '@/types/youth';
import { AccountFeedback } from './account-feedback';
import { TextAction } from './ui';
import { YouthRow, useYouthSnapshot, youthStyles as s } from './youth-ui';
export function YouthDetailScreen({id}:{id:string}) {
  const {token,user}=useSession();if(!token||!user)return <Redirect href="/login"/>;
  return <YouthDetailContent key={`${token}:${id}`} id={id}/>;
}
function YouthDetailContent({id}:{id:string}) {
  const {token}=useSession();
  const theme=useTheme(),valid=youthId(id),snapshot=useYouthSnapshot(valid?`/youth/${id}`:null,(v):v is import('@/types/youth').YouthBasicDetail=>isYouthBasicDetail(v,id));
  const [details,setDetails]=useState<{value:YouthDetailsView;deadline:number}|null>(null),[contacts,setContacts]=useState<{value:YouthContactsView;deadline:number}|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
  const keys=useRef<{details?:string;contacts?:string}>({}),locked=useRef(false),epoch=useRef(0);
  const basic=snapshot.data;
  useEffect(()=>{epoch.current++;locked.current=false;setBusy(false);if(!basic)return;if(!basic.permissions.canViewYouthDetails||details&&details.value.sourceUpdatedAt!==basic.youth.updatedAt)setDetails(null);if(!basic.permissions.canViewYouthContacts||contacts&&contacts.value.sourceUpdatedAt!==basic.youth.updatedAt)setContacts(null);},[basic,details,contacts]);
  useEffect(()=>{const deadline=Math.min(details?.deadline??Infinity,contacts?.deadline??Infinity);if(!Number.isFinite(deadline))return;const timer=setTimeout(()=>{if(details&&!youthDisclosureCurrent(details.deadline))setDetails(null);if(contacts&&!youthDisclosureCurrent(contacts.deadline))setContacts(null);},Math.max(0,deadline-performance.now()));return()=>clearTimeout(timer);},[details,contacts]);
  useEffect(()=>{if(!token)return;return registerYouthResource(token,()=>{epoch.current++;keys.current={};setDetails(null);setContacts(null);});},[token]);
  useEffect(()=>{if(snapshot.revoked){epoch.current++;keys.current={};setDetails(null);setContacts(null);}},[snapshot.revoked]);
  useEffect(()=>()=>{epoch.current++;keys.current={};},[]);
  const open=async(kind:'details'|'contacts')=>{
    if(locked.current||!snapshot.current()||!snapshot.verifiedRef.current||!basic||!basic.permissions[kind==='details'?'canViewYouthDetails':'canViewYouthContacts'])return;
    locked.current=true;setBusy(true);setError(null);const attempt=++epoch.current,started=performance.now();const requestId=keys.current[kind]??(keys.current[kind]=newYouthRequestId());
    try{const value=await snapshot.request<unknown>(`/youth/${id}/${kind}`,{method:'POST',body:{requestId}});if(attempt!==epoch.current||!snapshot.current()||!snapshot.verifiedRef.current)return;
      if(kind==='details'){if(!isYouthDetailsView(value,id)||value.sourceUpdatedAt!==basic.youth.updatedAt)throw youthResponseError();const deadline=youthDisclosureDeadline(value,started);if(!youthDisclosureCurrent(deadline))throw youthResponseError();setDetails({value,deadline});}
      else{if(!isYouthContactsView(value,id)||value.sourceUpdatedAt!==basic.youth.updatedAt)throw youthResponseError();const deadline=youthDisclosureDeadline(value,started);if(!youthDisclosureCurrent(deadline))throw youthResponseError();setContacts({value,deadline});}
      delete keys.current[kind];
    }catch(cause){if(attempt!==epoch.current||!snapshot.current())return;if(youthPrivateFailure(cause)){setDetails(null);setContacts(null);snapshot.purge();}if(cause instanceof Error&&'status' in cause&&[409,410].includes(Number(cause.status))){delete keys.current[kind];if(kind==='details')setDetails(null);else setContacts(null);}setError(cause instanceof Error?cause.message:'열람 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.');}
    finally{if(attempt===epoch.current){locked.current=false;setBusy(false);}}
  };
  const visibleDetails=basic&&details&&details.value.sourceUpdatedAt===basic.youth.updatedAt&&basic.permissions.canViewYouthDetails&&youthDisclosureCurrent(details.deadline)?details.value.details:null;
  const visibleContacts=basic&&contacts&&contacts.value.sourceUpdatedAt===basic.youth.updatedAt&&basic.permissions.canViewYouthContacts&&youthDisclosureCurrent(contacts.deadline)?contacts.value.contacts:null;
  const navigate=(path:string)=>{if(snapshot.current()&&snapshot.verifiedRef.current&&!locked.current)router.push(path as never);};
  return <ScrollView style={[s.screen,{backgroundColor:theme.background}]} contentContainerStyle={s.content}>
    <AccountFeedback error={!valid?'청소년 식별자를 확인하세요.':snapshot.error||error}/>{snapshot.loading?<ActivityIndicator color={theme.accent}/>:null}
    {!basic&&!snapshot.loading?<Text style={[s.body,{color:theme.secondary}]}>현재 청소년 정보를 확인할 수 없습니다.</Text>:null}
    {basic?<><Text accessibilityRole="header" aria-level={2} style={[s.heading,{color:theme.text}]}>{basic.youth.name}</Text><Text style={[s.small,{color:theme.secondary}]}>입소 {formatYouthDate(basic.youth.admissionDate)} · 예정퇴소 {formatYouthDate(basic.youth.dischargeDate)}</Text>
      <View style={s.actions}><TextAction label="기본정보 새로고침" disabled={busy} onPress={()=>void snapshot.load()}/>{basic.permissions.canManageYouth?<TextAction label="정보 수정" disabled={busy} onPress={()=>navigate(`/youth/${id}/edit`)}/>:null}</View>
      {basic.permissions.canViewYouthDetails?<View style={s.section}><TextAction label={keys.current.details?'같은 상세 열람 요청 확인':'상세정보 확인'} disabled={busy} onPress={()=>void open('details')}/>{visibleDetails?<><Text selectable style={[s.body,{color:theme.text}]}>생년월일 {formatYouthDate(visibleDetails.birthDate)} · 만 나이 {visibleDetails.age??'미등록'} · 한국 나이 {visibleDetails.koreanAge??'미등록'}</Text><Text style={[s.small,{color:theme.secondary}]}>기본 예정퇴소일 {formatYouthDate(visibleDetails.initialDischargeDate)}</Text>{visibleDetails.dischargeExtensions.map(e=><View key={e.id}><Text style={[s.body,{color:theme.text}]}>연장 {e.extensionOrder}회 · {formatYouthDate(e.extendedDischargeDate)}</Text><Text selectable style={[s.body,{color:theme.text}]}>{e.reason}</Text><Text style={[s.small,{color:theme.secondary}]}>{e.processedBy.name} · {formatYouthTimestamp(e.processedAt)}</Text></View>)}</>:null}</View>:null}
      {basic.permissions.canViewYouthContacts?<View style={s.section}><TextAction label={keys.current.contacts?'같은 연락처 열람 요청 확인':'연락처 확인'} disabled={busy} onPress={()=>void open('contacts')}/>{visibleContacts?<><Text selectable style={[s.body,{color:theme.text}]}>본인 연락처 {visibleContacts.phone||'미등록'}</Text>{visibleContacts.familyContacts.map(c=><Text key={c.id} selectable style={[s.body,{color:theme.text}]}>{c.relationship||'관계 미등록'} · {c.phone||'연락처 미등록'}</Text>)}</>:null}</View>:null}
      {basic.permissions.canManageYouth&&basic.permissions.canViewYouthDetails?<YouthRow title="퇴소일 연장" onPress={()=>navigate(`/youth/${id}/extension`)} disabled={busy}/>:null}
      <YouthRow title="개인 일정" onPress={()=>navigate(`/youth/${id}/personal-schedule`)} disabled={busy}/><YouthRow title="수학 개념 체크" onPress={()=>navigate(`/youth/${id}/learning`)} disabled={busy}/>{basic.permissions.canDownloadYouthDocuments||basic.permissions.canManageYouth?<YouthRow title="결정문 관리" disabled={busy} onPress={()=>navigate(`/youth/${id}/documents`)}/>:null}<YouthRow title="처리 이력" onPress={()=>navigate(`/youth/${id}/history`)} disabled={busy}/>
    </>:null}
  </ScrollView>;
}
