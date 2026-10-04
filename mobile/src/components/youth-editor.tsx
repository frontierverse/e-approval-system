import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
/* Scope cleanup effects intentionally depend on the permission snapshot or token; render-created action callbacks would retrigger them and discard dirty input. */
/* eslint-disable react-hooks/exhaustive-deps */
/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { formatYouthDate, isYouthDate, isYouthBasicDetail, isYouthContactsView, isYouthDetailsView, isYouthList, newYouthRequestId, youthDisclosureCurrent, youthDisclosureDeadline, youthId, youthProfileErrors, youthProfilePatch, youthResponseError } from '@/lib/youth';
import type { YouthBasic, YouthBasicDetail, YouthContacts, YouthList, YouthProfileDraft } from '@/types/youth';
import { AccountFeedback } from './account-feedback';
import { PrimaryButton, TextAction } from './ui';
import { useConfirmAction } from './use-confirm-action';
import { YouthField, useYouthSnapshot, youthStyles as s } from './youth-ui';
import { useYouthMutation } from './youth-mutation';
import { YouthFilesEditor, useYouthUploads } from './youth-files-editor';
const emptyDraft=():YouthProfileDraft=>({name:'',admissionDate:'',dischargeDate:'',birthDate:'',phone:'',familyContacts:[]});
export function YouthEditor({id}:{id?:string}) {const {token,user}=useSession();if(!token||!user)return <Redirect href="/login"/>;return <YouthEditorContent key={`${token}:${id??'new'}`} id={id}/>;}
function YouthEditorContent({id}:{id?:string}) {
  const theme=useTheme(),insets=useSafeAreaInsets(),confirmation=useConfirmAction(),navigation=useNavigation();
  const valid=id===undefined||youthId(id),create=id===undefined;
  const snapshot=useYouthSnapshot<YouthBasicDetail|YouthList>(valid?(id?`/youth/${id}`:'/youth?page=1'):null,(v):v is YouthBasicDetail|YouthList=>id?isYouthBasicDetail(v,id):isYouthList(v));
  const [draft,setDraft]=useState(emptyDraft),[base,setBase]=useState<YouthBasic|null>(null),[fields,setFields]=useState<Record<string,string>>({}),[notice,setNotice]=useState<string|null>(null),[privateBusy,setPrivateBusy]=useState(false),[privateError,setPrivateError]=useState<string|null>(null);
  const draftRef=useRef(draft);draftRef.current=draft;
  const initial=useRef(JSON.stringify(emptyDraft())),initialised=useRef(false),privateBase=useRef<{birthDate?:string|null;contacts?:YouthContacts}>({}),deadlines=useRef<{details?:number;contacts?:number}>({}),viewKeys=useRef<{details?:string;contacts?:string}>({}),privateLock=useRef(false),privateEpoch=useRef(0),privateEdited=useRef({details:false,contacts:false});
  const [revealVersion,setRevealVersion]=useState(0);
  const data=snapshot.data,permissions=data?.permissions;
  const canWrite=()=>snapshot.current()&&snapshot.verifiedRef.current&&!!snapshot.cached.current?.permissions.canManageYouth;
  const uploads=useYouthUploads({targetYouthId:id??null,current:canWrite,scopeCurrent:snapshot.accountCurrent});
  const clear=()=>{initial.current=JSON.stringify(emptyDraft());privateEdited.current={details:false,contacts:false};uploads.clear();privateLock.current=false;setPrivateBusy(false);privateBase.current={};deadlines.current={};viewKeys.current={};privateEpoch.current++;setDraft(emptyDraft());setBase(null);initialised.current=false;};
  const forgetDisclosure=(kind:'details'|'contacts')=>{
    const clean=JSON.parse(initial.current) as YouthProfileDraft;
    if(kind==='details'){
      delete privateBase.current.birthDate;delete deadlines.current.details;
      clean.birthDate='';if(!privateEdited.current.details)setDraft(d=>({...d,birthDate:''}));
    }else{
      delete privateBase.current.contacts;delete deadlines.current.contacts;
      clean.phone='';clean.familyContacts=[];if(!privateEdited.current.contacts)setDraft(d=>({...d,phone:'',familyContacts:[]}));
    }
    initial.current=JSON.stringify(clean);
  };
  const mutation=useYouthMutation({current:canWrite,resultGuard:isYouthBasicDetail,onLoss:()=>{clear();snapshot.purge();},onSuccess:value=>{
    uploads.clear();
    if(create||value.outcome==='unavailable')clear();
    else {
      const basic=value.result?.youth;
      const next={...emptyDraft(),name:basic?.name??draftRef.current.name,admissionDate:basic?.admissionDate??draftRef.current.admissionDate};
      setDraft(next);initial.current=JSON.stringify(next);
      if(basic)setBase(basic);
      privateBase.current={};deadlines.current={};viewKeys.current={};privateEdited.current={details:false,contacts:false};setRevealVersion(v=>v+1);
    }
    setNotice(value.outcome==='unavailable'?'등록이 확정되었습니다. 현재 명단 범위에서는 본문을 열람할 수 없습니다.':'청소년 정보 저장이 확정되었습니다.');
    void snapshot.load();
  }});
  useEffect(()=>{if(!data)return;if(!data.permissions.canManageYouth){clear();return;}if(!create&&'youth' in data&&!initialised.current){const next={...emptyDraft(),name:data.youth.name,admissionDate:data.youth.admissionDate??''};setDraft(next);setBase(data.youth);initial.current=JSON.stringify(next);initialised.current=true;}if(!create&&(!data.permissions.canViewYouthDetails||'youth'in data&&base&&data.youth.updatedAt!==base.updatedAt)){forgetDisclosure('details');if(!data.permissions.canViewYouthDetails){privateEdited.current.details=false;setDraft(d=>({...d,birthDate:''}));}}if(!create&&(!data.permissions.canViewYouthContacts||'youth'in data&&base&&data.youth.updatedAt!==base.updatedAt)){forgetDisclosure('contacts');if(!data.permissions.canViewYouthContacts){privateEdited.current.contacts=false;setDraft(d=>({...d,phone:'',familyContacts:[]}));}}},[data,create]);
  useEffect(()=>{if(snapshot.revoked)clear();},[snapshot.revoked]);
  useEffect(()=>()=>{privateEpoch.current++;privateBase.current={};},[]);
  useEffect(()=>{
    const next=Math.min(deadlines.current.details??Infinity,deadlines.current.contacts??Infinity);
    if(!Number.isFinite(next))return;
    const timer=setTimeout(()=>{
      const now=performance.now();
      if(deadlines.current.details!==undefined&&now>=deadlines.current.details){forgetDisclosure('details');}
      if(deadlines.current.contacts!==undefined&&now>=deadlines.current.contacts){forgetDisclosure('contacts');}
      setRevealVersion(v=>v+1);
    },Math.max(0,next-performance.now()));
    return()=>clearTimeout(timer);
  },[revealVersion]);
  const birthOpen=create||privateBase.current.birthDate!==undefined&&youthDisclosureCurrent(deadlines.current.details??0);
  const contactsOpen=create||!!privateBase.current.contacts&&youthDisclosureCurrent(deadlines.current.contacts??0);
  const reveal=async(kind:'details'|'contacts')=>{
    if(!id||privateLock.current||mutation.busyRef.current||!canWrite()||!permissions?.[kind==='details'?'canViewYouthDetails':'canViewYouthContacts'])return;
    privateLock.current=true;setPrivateBusy(true);setPrivateError(null);const epoch=++privateEpoch.current,started=performance.now(),requestId=viewKeys.current[kind]??(viewKeys.current[kind]=newYouthRequestId());
    try{const v=await snapshot.request<unknown>(`/youth/${id}/${kind}`,{method:'POST',body:{requestId}});if(epoch!==privateEpoch.current||!canWrite())return;if(kind==='details'){if(!isYouthDetailsView(v,id)||v.sourceUpdatedAt!==base?.updatedAt)throw youthResponseError();privateBase.current.birthDate=v.details.birthDate;deadlines.current.details=youthDisclosureDeadline(v,started);if(!privateEdited.current.details){setDraft(d=>({...d,birthDate:v.details.birthDate??''}));initial.current=JSON.stringify({...JSON.parse(initial.current),birthDate:v.details.birthDate??''});}}else{if(!isYouthContactsView(v,id)||v.sourceUpdatedAt!==base?.updatedAt)throw youthResponseError();privateBase.current.contacts=v.contacts;deadlines.current.contacts=youthDisclosureDeadline(v,started);if(!privateEdited.current.contacts){const next={phone:v.contacts.phone??'',familyContacts:v.contacts.familyContacts.map(c=>({relationship:c.relationship??'',phone:c.phone??''}))};setDraft(d=>({...d,...next}));initial.current=JSON.stringify({...JSON.parse(initial.current),...next});}}delete viewKeys.current[kind];setRevealVersion(v=>v+1);}
    catch(cause){if(epoch===privateEpoch.current&&snapshot.current()){if(cause instanceof Error&&'status'in cause&&[409,410].includes(Number(cause.status))){delete viewKeys.current[kind];delete deadlines.current[kind];if(kind==='details')delete privateBase.current.birthDate;else delete privateBase.current.contacts;}if(cause instanceof Error&&'status'in cause&&[401,403,404].includes(Number(cause.status))){clear();snapshot.purge();}setPrivateError(cause instanceof Error?cause.message:'열람 결과를 확인하지 못했습니다.');}}
    finally{if(epoch===privateEpoch.current){privateLock.current=false;setPrivateBusy(false);}}
  };
  const change=(key:keyof YouthProfileDraft,value:string)=>{if(!canWrite()||mutation.locked||privateLock.current)return;if(key==='birthDate')privateEdited.current.details=true;if(key==='phone')privateEdited.current.contacts=true;setDraft(d=>({...d,[key]:value}));setNotice(null);setFields({});mutation.clearValidation();};
  const save=async()=>{if(!canWrite()||privateLock.current||mutation.locked||uploads.busyRef.current)return;if(create&&uploads.readyIds().some(x=>x===null)){setFields({uploadIds:'선택한 파일의 업로드 준비를 완료하세요.'});return;}const errors=youthProfileErrors(contactsOpen?draft:{...draft,phone:'',familyContacts:[]},create);if(!create&&birthOpen&&draft.birthDate&&!isYouthDate(draft.birthDate))errors.birthDate='날짜를 YYYY-MM-DD로 입력하세요.';setFields(errors);if(Object.keys(errors).length)return;
    if(create)await mutation.submit({operation:'profile.create',path:'/youth',method:'POST',body:{name:draft.name.trim(),admissionDate:draft.admissionDate||null,dischargeDate:draft.dischargeDate||null,birthDate:draft.birthDate||null,phone:draft.phone.trim()||null,familyContacts:draft.familyContacts.map(c=>({relationship:c.relationship.trim()||null,phone:c.phone.trim()||null})),uploadIds:uploads.readyIds()}});
    else if(base){const authorized={...(birthOpen?{birthDate:privateBase.current.birthDate}:{}),...(contactsOpen?{contacts:privateBase.current.contacts}:{})};const patch=youthProfilePatch(draft,base,authorized);if(!Object.keys(patch).length){setNotice('변경한 내용이 없습니다.');return;}await mutation.submit({operation:'profile.patch',targetId:id,path:`/youth/${id}`,method:'PATCH',body:{expectedUpdatedAt:base.updatedAt,patch}});}
  };
  const latest=async()=>{if(!id||!canWrite()||mutation.busyRef.current)return;await snapshot.load();};
  const adopt=async()=>{const latestData=snapshot.cached.current;if(!latestData||!('youth'in latestData)||!canWrite()||mutation.state!=='conflict')return;const accepted=await confirmation.ask({title:'최신 기준 선택',message:'내 입력을 유지하고 최신 청소년 정보를 수정 기준으로 선택합니다. 내용을 확인한 뒤 다시 저장하세요.',confirm:'입력 유지하고 기준 선택'});if(accepted&&canWrite()&&snapshot.cached.current===latestData&&mutation.useLatest()){setBase(latestData.youth);privateBase.current={};deadlines.current={};setRevealVersion(v=>v+1);setNotice('최신 기준을 선택했습니다. 생년월일·연락처 변경은 다시 명시 열람한 뒤 확인하세요.');}};
  const dirty=JSON.stringify(draft)!==initial.current;
  usePreventRemove(dirty||uploads.files.length>0||mutation.busy||mutation.state!=='idle',({data:action})=>{if(!snapshot.current())return;void confirmation.ask({title:'작성 화면 나가기',message:'저장하지 않은 입력이 사라집니다. 결과가 불명확한 저장은 먼저 원래 요청의 결과를 확인하세요. 나가시겠습니까?',confirm:'입력 버리고 나가기',danger:true}).then(yes=>{if(yes&&snapshot.current()&&!mutation.busyRef.current&&!uploads.busyRef.current)navigation.dispatch(action.action);});});
  const errors={...mutation.fields,...fields};
  return <KeyboardScreen style={[s.screen,{backgroundColor:theme.background}]}>
    <KeyboardScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><AccountFeedback error={!valid?'청소년 식별자를 확인하세요.':snapshot.error||privateError||mutation.error||Object.values(fields)[0]} message={notice}/>{snapshot.loading?<ActivityIndicator color={theme.accent}/>:null}
      {data&&permissions?.canManageYouth?<><Text accessibilityRole="header" aria-level={2} style={[s.heading,{color:theme.text}]}>{create?'청소년 등록':'청소년 정보 수정'}</Text>
        <YouthField label="이름" value={draft.name} onChange={v=>change('name',v)} error={errors.name} disabled={mutation.locked}/><YouthField label="입소일" value={draft.admissionDate} onChange={v=>change('admissionDate',v)} error={errors.admissionDate} placeholder="YYYY-MM-DD" disabled={mutation.locked}/>
        {create?<YouthField label="예정퇴소일" value={draft.dischargeDate} onChange={v=>change('dischargeDate',v)} error={errors.dischargeDate} placeholder="YYYY-MM-DD" disabled={mutation.locked}/>:<Text style={[s.small,{color:theme.secondary}]}>예정퇴소일 {formatYouthDate(base?.dischargeDate??null)} · 변경은 퇴소연장에서 처리합니다.</Text>}
        {!create&&permissions.canViewYouthDetails?<TextAction label="생년월일 수정용 상세정보 확인" disabled={mutation.locked||privateBusy} onPress={()=>void reveal('details')}/>:null}
        {birthOpen?<YouthField label="생년월일" value={draft.birthDate} onChange={v=>change('birthDate',v)} error={errors.birthDate} placeholder="YYYY-MM-DD" disabled={mutation.locked}/>:null}
        {!create&&permissions.canViewYouthContacts?<TextAction label="연락처 수정용 열람" disabled={mutation.locked||privateBusy} onPress={()=>void reveal('contacts')}/>:null}
        {contactsOpen?<><YouthField label="본인 연락처" value={draft.phone} onChange={v=>change('phone',v)} error={errors.phone} hint="010-0000-0000" disabled={mutation.locked}/>{draft.familyContacts.map((c,i)=><View key={i} style={s.section}><YouthField label={`가족 ${i+1} 관계`} value={c.relationship} disabled={mutation.locked} onChange={v=>{if(canWrite()&&!mutation.locked){privateEdited.current.contacts=true;setDraft(d=>({...d,familyContacts:d.familyContacts.map((x,j)=>j===i?{...x,relationship:v}:x)}));}}}/><YouthField label={`가족 ${i+1} 연락처`} value={c.phone} disabled={mutation.locked} onChange={v=>{if(canWrite()&&!mutation.locked){privateEdited.current.contacts=true;setDraft(d=>({...d,familyContacts:d.familyContacts.map((x,j)=>j===i?{...x,phone:v}:x)}));}}}/><TextAction label={`가족 ${i+1} 입력 제거`} disabled={mutation.locked} onPress={()=>{if(canWrite()&&!mutation.locked){privateEdited.current.contacts=true;setDraft(d=>({...d,familyContacts:d.familyContacts.filter((_,j)=>j!==i)}));}}}/></View>)}<TextAction label="가족 연락처 입력 추가" disabled={mutation.locked} onPress={()=>{if(canWrite()&&!mutation.locked){privateEdited.current.contacts=true;setDraft(d=>({...d,familyContacts:[...d.familyContacts,{relationship:'',phone:''}]}));}}}/></>:null}
        {create?<YouthFilesEditor uploads={uploads} disabled={mutation.locked||privateBusy}/>:null}
        {mutation.state==='conflict'?<><Text style={[s.body,{color:theme.secondary}]}>내 입력을 보존했습니다. 최신 정보와 비교한 뒤 수정 기준을 선택하세요.</Text><TextAction label="최신 청소년 정보 확인" onPress={()=>void latest()}/>{snapshot.cached.current&&'youth'in snapshot.cached.current?<Text style={[s.small,{color:theme.secondary}]}>최신 이름 {snapshot.cached.current.youth.name} · 입소 {formatYouthDate(snapshot.cached.current.youth.admissionDate)}</Text>:null}<TextAction label="내 입력 유지하고 최신 기준 선택" onPress={()=>void adopt()}/></>:null}
        {mutation.state==='uncertain'?<><Text style={[s.body,{color:theme.secondary}]}>원래 입력과 요청 키를 보존했습니다. 새로운 등록을 만들지 않고 원래 결과를 먼저 확인하세요.</Text><TextAction label="원래 저장 결과 확인" disabled={mutation.busy} onPress={()=>void mutation.check()}/>{mutation.pending.current?.body?<TextAction label="같은 저장 요청 재시도" disabled={mutation.busy} onPress={()=>void mutation.retry()}/>:null}</>:null}
      </>:!snapshot.loading?<Text style={[s.body,{color:theme.secondary}]}>현재 관리 권한과 정보를 확인할 수 없습니다.</Text>:null}
    </KeyboardScrollView>
    {data&&permissions?.canManageYouth?<View style={[s.bar,{paddingBottom:Math.max(8,insets.bottom),borderColor:theme.border,backgroundColor:theme.surface}]}><PrimaryButton title={mutation.busy?'저장 처리 중':'청소년 정보 저장'} disabled={mutation.locked||privateBusy||uploads.busy} onPress={()=>void save()}/></View>:null}{confirmation.dialog}
  </KeyboardScreen>;
}
