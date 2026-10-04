/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { formatYouthDate, isYouthDate, youthId, youthPrivateFailure, youthResponseError } from '@/lib/youth';
import { isYouthActivityResult, isYouthPersonalList, isYouthPersonalDetail, youthMinute, youthTime, youthWeekdays } from '@/lib/youth-activities';
import type { YouthPersonalList, YouthPersonalSchedule } from '@/types/youth';
import { AccountFeedback } from './account-feedback';
import { PrimaryButton, TextAction } from './ui';
import { YouthField, YouthRow, useYouthSnapshot, youthStyles as s } from './youth-ui';
import { useYouthMutation } from './youth-mutation';
import { YouthMutationActions, useYouthLeave } from './youth-write-ui';
const blank=()=>({content:'',start:'09:00',end:'10:00',scheduleType:'GENERAL' as 'GENERAL'|'HOSPITAL',selectionMode:'DATES' as 'DATES'|'WEEKDAYS',dates:'',weekdays:[] as number[],recurrenceStartDate:'',recurrenceEndDate:'',hospitalName:'',escortType:'STAFF' as 'STAFF'|'OTHER',escortUserId:'',escortOtherName:'',nextAppointmentDate:''});
export function YouthPersonalScreen({id,date}:{id:string;date?:string}){const {token,user}=useSession();return token&&user?<Personal key={`${token}:${id}:${date}`} id={id} date={date}/>:<Redirect href="/login"/>;}
function Personal({id,date}:{id:string;date?:string}) {
 const theme=useTheme(),insets=useSafeAreaInsets(),valid=youthId(id)&&(date===undefined||isYouthDate(date));
 const snapshot=useYouthSnapshot(valid?`/youth/${id}/personal-schedules${date?'?date='+date+'&month='+date.slice(0,7):''}`:null,(v):v is YouthPersonalList=>isYouthPersonalList(v,id));
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(blank),[base,setBase]=useState<YouthPersonalSchedule|null>(null),[notice,setNotice]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[dateInput,setDateInput]=useState(date??'');
 const original=useRef(''),latest=useRef<YouthPersonalSchedule|null>(null);const current=()=>snapshot.current()&&snapshot.verifiedRef.current;
 const canWrite=()=>current()&&!!snapshot.cached.current?.permissions.canManageYouth;
 const clear=()=>{setDraft(blank());setBase(null);setEditing(false);latest.current=null;};
 const mutation=useYouthMutation({current:canWrite,resultGuard:isYouthActivityResult,onLoss:()=>{clear();snapshot.purge();},onSuccess:()=>{original.current=JSON.stringify(draft);setNotice('개인 일정 변경이 확정되었습니다.');setEditing(false);setBase(null);void snapshot.load();}});
 useEffect(()=>{if(snapshot.data&&!snapshot.data.permissions.canManageYouth)clear();},[snapshot.data]);useEffect(()=>{if(snapshot.revoked)clear();},[snapshot.revoked]);
 const dirty=editing&&JSON.stringify(draft)!==original.current;
 const confirm=useYouthLeave(dirty||mutation.busy||mutation.state!=='idle',snapshot.current,()=>mutation.busyRef.current);
 const change=(key:keyof ReturnType<typeof blank>,value:unknown)=>{if(canWrite()&&!mutation.locked){setDraft(d=>({...d,[key]:value,...(key==='scheduleType'&&value==='HOSPITAL'?{selectionMode:'DATES' as const,dates:d.dates.split(',').map(x=>x.trim()).find(isYouthDate)??snapshot.cached.current!.date}: {})}));setError(null);mutation.clearValidation();}};
 const open=(row:YouthPersonalSchedule|null)=>{if(!current()||mutation.locked||!row&&!canWrite())return;const value=row?{...blank(),content:row.content,start:youthTime(row.startMinute),end:youthTime(row.endMinute),scheduleType:row.scheduleType,selectionMode:row.selectionMode,dates:row.occurrenceDates.join(', '),weekdays:row.recurrenceWeekdays,recurrenceStartDate:row.recurrenceStartDate??'',recurrenceEndDate:row.recurrenceEndDate??'',hospitalName:row.hospitalName??'',escortType:row.escortType??'STAFF',escortUserId:row.escortUserId??'',escortOtherName:row.escortType==='OTHER'?row.escortName??'':'',nextAppointmentDate:row.nextAppointmentDate??''}:{...blank(),dates:snapshot.cached.current!.date};setDraft(value);setBase(row);original.current=JSON.stringify(value);setEditing(true);setNotice(null);setError(null);};
 const save=async()=>{if(!canWrite()||mutation.locked)return;const startMinute=youthMinute(draft.start),endMinute=youthMinute(draft.end,true),dates=draft.dates.split(',').map(x=>x.trim()).filter(Boolean);
  if(startMinute===null||endMinute===null||endMinute<=startMinute){setError('시간을 10분 단위 HH:mm으로 입력하세요. 종료는 24:00까지입니다.');return;}
  if(draft.selectionMode==='DATES'&&(!dates.length||dates.length>366||!dates.every(isYouthDate)||new Set(dates).size!==dates.length)){setError('중복 없는 날짜를 YYYY-MM-DD로 입력하세요. 여러 날짜는 쉼표로 구분하며 최대 366개입니다.');return;}
  if(draft.scheduleType==='GENERAL'&&(!draft.content.trim()||draft.content.trim().length>200)){setError('일정 내용을 1~200자로 입력하세요.');return;}
  if(draft.scheduleType==='HOSPITAL'&&(draft.selectionMode!=='DATES'||dates.length!==1||!draft.hospitalName.trim()||draft.hospitalName.trim().length>100||draft.escortType==='STAFF'&&!snapshot.cached.current!.staffOptions.some(x=>x.id===draft.escortUserId)||draft.escortType==='OTHER'&&(!draft.escortOtherName.trim()||draft.escortOtherName.trim().length>80))){setError('병원명과 한 개 방문일, 해당 방문일의 동행 직원을 확인하세요. 기타 동행인은 80자 이내입니다.');return;}
  const input={content:draft.content.trim(),startMinute,endMinute,selectionMode:draft.selectionMode,occurrenceDates:dates,recurrenceWeekdays:draft.weekdays,recurrenceStartDate:draft.recurrenceStartDate,recurrenceEndDate:draft.recurrenceEndDate,scheduleType:draft.scheduleType,hospitalName:draft.hospitalName.trim(),escortType:draft.escortType,escortUserId:draft.escortUserId,escortOtherName:draft.escortOtherName.trim(),nextAppointmentDate:draft.nextAppointmentDate};
  await mutation.submit({operation:base?'personal.update':'personal.create',targetId:base?.id,path:base?`/youth/personal-schedules/${base.id}`:`/youth/${id}/personal-schedules`,method:base?'PUT':'POST',body:base?{youthId:id,expectedUpdatedAt:base.updatedAt,input}:{input}});
 };
 const remove=async()=>{if(!base||!canWrite()||mutation.locked)return;const captured=base,yes=await confirm.ask({title:'개인 일정 삭제',message:'이 일정에 속한 모든 반복 날짜가 삭제됩니다.',confirm:'일정 삭제',danger:true});if(yes&&canWrite()&&base===captured&&!mutation.locked)await mutation.submit({operation:'personal.delete',targetId:base.id,path:`/youth/personal-schedules/${base.id}`,method:'DELETE',body:{youthId:id,expectedUpdatedAt:base.updatedAt}});};
 const refresh=async()=>{
  const captured=base;
  await snapshot.load();
  if(!current()||base!==captured)return;
  latest.current=null;
  if(!captured)return;
  try {
   const value=await snapshot.request<unknown>(`/youth/personal-schedules/${captured.id}`);
   if(!current()||base!==captured)return;
   if(!isYouthPersonalDetail(value,captured.id,id))throw youthResponseError();
   latest.current=value.schedule;
   setNotice(`최신 일정: ${value.schedule.content} · ${value.schedule.occurrenceDates.join(', ')} · ${youthTime(value.schedule.startMinute)}–${youthTime(value.schedule.endMinute)}`);
  } catch(cause) {
   if(!current()||base!==captured)return;
   if(youthPrivateFailure(cause)){clear();snapshot.purge();}
   setError(cause instanceof Error?cause.message:'최신 개인 일정을 확인하지 못했습니다.');
  }
 };
 const adopt=async()=>{if(!current()||mutation.state!=='conflict')return;const row=latest.current,captured=base;if(base&&!row){setError('기존 일정 기준을 확인하지 못했습니다. 원래 일정 식별자로 다시 확인하세요.');return;}const yes=await confirm.ask({title:'최신 일정 기준',message:'내 입력을 유지하고 확인한 최신 일정 기준으로 다시 저장합니다.',confirm:'최신 기준 선택'});if(yes&&canWrite()&&latest.current===row&&base===captured&&mutation.useLatest()){setBase(row);setError(null);}};
 const close=async()=>{if(!current()||mutation.busyRef.current||mutation.state!=='idle')return;const yes=!dirty||await confirm.ask({title:'개인 일정 작성 닫기',message:'저장하지 않은 입력이 사라집니다.',confirm:'입력 버리고 닫기',danger:true});if(yes&&current()&&!mutation.busyRef.current)clear();};
 return <KeyboardAvoidingView style={[s.screen,{backgroundColor:theme.background}]} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><AccountFeedback error={!valid?'날짜와 청소년 식별자를 확인하세요.':snapshot.error||mutation.error||error} message={notice}/>{snapshot.loading?<ActivityIndicator color={theme.accent}/>:null}{snapshot.data?<><Text accessibilityRole="header" aria-level={2} style={[s.heading,{color:theme.text}]}>{snapshot.data.youth.name} 개인 일정</Text>{!editing?<><YouthField label="조회 날짜" placeholder="YYYY-MM-DD" value={dateInput||snapshot.data.date} onChange={setDateInput}/><TextAction label="선택 날짜 일정 확인" onPress={()=>{const chosen=dateInput||snapshot.cached.current?.date;if(current()&&isYouthDate(chosen))requireDateNavigation(chosen);else setError('조회 날짜를 YYYY-MM-DD로 입력하세요.');}}/><Text style={[s.small,{color:theme.secondary}]}>{formatYouthDate(snapshot.data.date)} · {snapshot.data.schedules.filter(x=>x.occurrenceDates.includes(snapshot.data!.date)).length}개</Text>{snapshot.data.permissions.canManageYouth?<TextAction label="개인 일정 등록" onPress={()=>open(null)}/>:null}{snapshot.data.schedules.filter(x=>x.occurrenceDates.includes(snapshot.data!.date)).map(row=><YouthRow key={row.id} title={row.scheduleType==='HOSPITAL'?`${row.hospitalName} 병원 진료`:row.content} detail={`${youthTime(row.startMinute)}–${youthTime(row.endMinute)}${row.escortName?' · 동행 '+row.escortName:''}${row.nextAppointmentDate?' · 다음 예약 '+row.nextAppointmentDate:''}`} onPress={()=>open(row)} disabled={mutation.locked||!current()}/>)}</>:<>
 <View style={s.actions}>{(['GENERAL','HOSPITAL'] as const).map(type=><TextAction key={type} label={(draft.scheduleType===type?'선택 · ':'')+(type==='GENERAL'?'일반 일정':'병원 진료')} disabled={mutation.locked||!canWrite()} onPress={()=>change('scheduleType',type)}/>)}</View>
 <YouthField label="시작 시간" value={draft.start} placeholder="HH:mm" disabled={mutation.locked||!canWrite()} onChange={v=>change('start',v)}/><YouthField label="종료 시간" value={draft.end} placeholder="HH:mm" disabled={mutation.locked||!canWrite()} onChange={v=>change('end',v)}/>
 {draft.scheduleType==='GENERAL'?<><YouthField label="일정 내용" value={draft.content} hint="200자 이내" disabled={mutation.locked||!canWrite()} onChange={v=>change('content',v)}/><View style={s.actions}>{(['DATES','WEEKDAYS'] as const).map(mode=><TextAction key={mode} label={(draft.selectionMode===mode?'선택 · ':'')+(mode==='DATES'?'날짜 직접 선택':'요일 반복')} disabled={mutation.locked||!canWrite()} onPress={()=>change('selectionMode',mode)}/>)}</View></>:null}
 {draft.selectionMode==='DATES'?<YouthField label="일정 날짜" value={draft.dates} hint="YYYY-MM-DD, YYYY-MM-DD · 쉼표로 구분" multiline disabled={mutation.locked||!canWrite()} onChange={v=>change('dates',v)}/>:<><YouthField label="반복 시작일" value={draft.recurrenceStartDate} disabled={mutation.locked||!canWrite()} onChange={v=>change('recurrenceStartDate',v)}/><YouthField label="반복 종료일" value={draft.recurrenceEndDate} disabled={mutation.locked||!canWrite()} onChange={v=>change('recurrenceEndDate',v)}/><View style={s.actions}>{youthWeekdays.map((day,i)=><TextAction key={day} label={`${draft.weekdays.includes(i)?'선택 · ':''}${day}요일`} disabled={mutation.locked||!canWrite()} onPress={()=>change('weekdays',draft.weekdays.includes(i)?draft.weekdays.filter(x=>x!==i):[...draft.weekdays,i])}/>)}</View></>}
 {draft.scheduleType==='HOSPITAL'?<><YouthField label="병원명" value={draft.hospitalName} disabled={mutation.locked||!canWrite()} onChange={v=>change('hospitalName',v)}/><View style={s.actions}><TextAction label="직원 동행" disabled={mutation.locked||!canWrite()} onPress={()=>change('escortType','STAFF')}/><TextAction label="기타 동행인" disabled={mutation.locked||!canWrite()} onPress={()=>change('escortType','OTHER')}/></View>{draft.escortType==='STAFF'?<><Text style={[s.small,{color:theme.secondary}]}>조회 날짜의 재직 직원입니다. 방문 날짜가 다르면 먼저 그 날짜로 조회하세요.</Text>{snapshot.data.staffOptions.map(x=><TextAction key={x.id} label={`${draft.escortUserId===x.id?'선택 · ':''}${x.name}`} disabled={mutation.locked||!canWrite()} onPress={()=>change('escortUserId',x.id)}/>)}</>:<YouthField label="기타 동행인 이름" value={draft.escortOtherName} disabled={mutation.locked||!canWrite()} onChange={v=>change('escortOtherName',v)}/>}<YouthField label="다음 예약일" value={draft.nextAppointmentDate} hint="참고 기록입니다. 새 일정을 자동 등록하지 않습니다." placeholder="YYYY-MM-DD" disabled={mutation.locked||!canWrite()} onChange={v=>change('nextAppointmentDate',v)}/></>:null}
 {base?<TextAction label="개인 일정 삭제" disabled={mutation.locked||!canWrite()} onPress={()=>void remove()}/>:null}<TextAction label="작성 닫기" disabled={mutation.locked} onPress={()=>void close()}/></>}
 </>:!snapshot.loading?<Text style={[s.body,{color:theme.secondary}]}>개인 일정을 확인할 수 없습니다.</Text>:null}<YouthMutationActions mutation={mutation} onRefresh={refresh} onAdopt={()=>void adopt()}/><TextAction label="개인 일정 다시 확인" onPress={()=>void snapshot.load()}/></ScrollView>{snapshot.data&&editing&&canWrite()?<View style={[s.bar,{backgroundColor:theme.surface,borderColor:theme.border,paddingBottom:Math.max(8,insets.bottom)}]}><PrimaryButton title="개인 일정 저장" disabled={mutation.locked||!canWrite()} onPress={()=>void save()}/></View>:null}{confirm.dialog}</KeyboardAvoidingView>;
}
function requireDateNavigation(date:string){router.setParams({date});}
