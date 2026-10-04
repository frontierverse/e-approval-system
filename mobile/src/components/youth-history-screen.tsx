/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */

import { Redirect, router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { formatYouthTimestamp, isYouthHistory, youthId, youthPage } from '@/lib/youth';
import { isYouthActivityHistory } from '@/lib/youth-activities';
import { AccountFeedback } from './account-feedback';
import { TextAction } from './ui';
import { useYouthSnapshot, youthStyles as s } from './youth-ui';
export function YouthHistoryScreen({id,page,activity,query}:{id?:string;page?:string;activity?:'common'|'learning'|'rules';query?:string}){const {token,user}=useSession();return token&&user?<History key={`${token}:${id}:${activity}:${query}:${page}`} id={id} page={page} activity={activity} query={query}/>:<Redirect href="/login"/>;}
function History({id,page,activity,query}:{id?:string;page?:string;activity?:'common'|'learning'|'rules';query?:string}){
 const theme=useTheme(),number=youthPage(page),valid=number!==null&&(activity?(activity!=='learning'||youthId(id)):youthId(id));const root=activity==='common'?'/youth/common-schedules/history':activity==='learning'?`/youth/${id}/learning/history`:activity==='rules'?'/youth/rules/history':`/youth/${id}/history`;
 const snapshot=useYouthSnapshot<import('@/types/youth').YouthHistory|import('@/types/youth').YouthActivityHistory>(valid?`${root}?page=${number}${query?'&'+query:''}`:null,(v):v is import('@/types/youth').YouthHistory|import('@/types/youth').YouthActivityHistory=>activity?isYouthActivityHistory(v):isYouthHistory(v,id));const data=snapshot.data;
 const goto=(p:number)=>{if(snapshot.current()&&snapshot.verifiedRef.current)router.setParams({page:String(p)});};
 return <ScrollView style={[s.screen,{backgroundColor:theme.background}]} contentContainerStyle={s.content}><AccountFeedback error={!valid?'조회 조건을 확인하세요.':snapshot.error}/>{snapshot.loading?<ActivityIndicator color={theme.accent}/>:null}{data?<><Text style={[s.small,{color:theme.secondary}]}>처리 이력 {data.total.toLocaleString('ko-KR')}건 · {data.page}/{data.totalPages}쪽</Text><View accessibilityRole="list" accessibilityLabel="청소년 처리 이력">{('items'in data?data.items:data.logs).map(row=><View key={row.id} role="listitem" style={s.section}><Text style={[s.body,{color:theme.text}]}>{'message'in row?row.message||row.changeType:row.action}</Text><Text style={[s.small,{color:theme.secondary}]}>{'actorName'in row?row.actorName:row.actor?.name||'알 수 없는 직원'} · {formatYouthTimestamp(row.createdAt)}</Text>{row.changes.map((c,i)=><Text key={i} selectable style={[s.body,{color:theme.text}]}>{c.label}: {('from'in c?c.from:c.before)??'없음'} → {('to'in c?c.to:c.after)??'없음'}</Text>)}</View>)}</View>{data.total===0?<Text style={[s.body,{color:theme.secondary}]}>처리 이력이 없습니다.</Text>:null}<View style={s.actions}><TextAction label="이전 이력" disabled={data.page<=1} onPress={()=>goto(data.page-1)}/><TextAction label="다음 이력" disabled={data.page>=data.totalPages} onPress={()=>goto(data.page+1)}/></View></>:!snapshot.loading?<Text style={[s.body,{color:theme.secondary}]}>이력을 확인할 수 없습니다.</Text>:null}<TextAction label="이력 다시 확인" onPress={()=>void snapshot.load()}/></ScrollView>;
}
