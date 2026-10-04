/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */

import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { formatYouthDate, isYouthList, youthPage } from '@/lib/youth';
import { AccountFeedback } from './account-feedback';
import { EmptyState, TextAction } from './ui';
import { YouthField, YouthRow, useYouthSnapshot, youthStyles as s } from './youth-ui';
export function YouthListScreen({q='',page:rawPage}:{q?:string;page?:string}) {
  const {token,user}=useSession();
  if(!token||!user)return <Redirect href="/login"/>;
  return <YouthListContent key={`${token}:${q}:${rawPage??''}`} q={q} rawPage={rawPage}/>;
}
function YouthListContent({q,rawPage}:{q:string;rawPage?:string}) {
  const theme=useTheme(),page=youthPage(rawPage),[query,setQuery]=useState(q);
  const valid=page!==null;
  const snapshot=useYouthSnapshot(valid?`/youth?q=${encodeURIComponent(q)}&page=${page}`:null,isYouthList);
  const navigate=(path:string)=>{if(snapshot.current()&&snapshot.verifiedRef.current)router.push(path as never);};
  const search=()=>{if(snapshot.current())router.setParams({q:query.trim(),page:'1'});};
  const data=snapshot.data;
  return <ScrollView style={[s.screen,{backgroundColor:theme.background}]} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.actions}><Text accessibilityRole="header" aria-level={2} style={[s.heading,{color:theme.text,flex:1}]}>청소년 명단</Text>{data?.permissions.canManageYouth?<TextAction label="청소년 등록" onPress={()=>navigate('/youth/new')}/>:null}</View>
    <YouthField label="이름 검색" value={query} onChange={value=>{if(snapshot.current())setQuery(value);}}/>
    <View style={s.actions}><TextAction label="검색" onPress={search}/><TextAction label="명단 새로고침" onPress={()=>void snapshot.load()}/></View>
    <AccountFeedback error={!valid?'조회 페이지를 확인하세요.':snapshot.error}/>
    <Text style={[s.small,{color:theme.secondary}]}>{data?`현재 대상 ${data.total.toLocaleString('ko-KR')}명 · ${data.page}/${data.totalPages}쪽`:snapshot.loading?'명단을 불러오는 중':'명단 확인 불가'}</Text>
    {snapshot.loading?<ActivityIndicator color={theme.accent}/>:null}
    {data?<View role="list" accessibilityLabel="현재 청소년 명단" style={{gap:6}}>{data.items.map(item=><YouthRow key={item.id} title={item.name} detail={`입소 ${formatYouthDate(item.admissionDate)} · 예정퇴소 ${formatYouthDate(item.dischargeDate)}`} onPress={()=>navigate(`/youth/${item.id}`)}/>)}{data.items.length===0?<EmptyState title="현재 조회된 청소년이 없습니다." detail="검색 조건을 확인하세요."/>:null}</View>:null}
    {data?<View style={s.actions}><TextAction label="이전 쪽" disabled={data.page<=1} onPress={()=>{if(snapshot.current()&&snapshot.verifiedRef.current)router.setParams({page:String(data.page-1)});}}/><TextAction label="다음 쪽" disabled={data.page>=data.totalPages} onPress={()=>{if(snapshot.current()&&snapshot.verifiedRef.current)router.setParams({page:String(data.page+1)});}}/></View>:null}
    {data?<View style={s.actions}><TextAction label="공통 시간표" onPress={()=>navigate('/youth/common-schedule')}/><TextAction label="생활 규칙" onPress={()=>navigate('/youth/rules')}/><TextAction label="수학 개념" onPress={()=>navigate('/youth/study-concepts')}/></View>:null}
  </ScrollView>;
}
