/* Scope cleanup effects intentionally depend on the permission snapshot or token; render-created action callbacks would retrigger them and discard dirty input. */
/* eslint-disable react-hooks/exhaustive-deps */
/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { isYouthBasicDetail, isYouthDocuments, youthId } from '@/lib/youth';
import { youthFileSize } from '@/lib/youth-file-transfer';
import type { YouthBasic, YouthDocument } from '@/types/youth';
import { AccountFeedback } from './account-feedback';
import { PrimaryButton, TextAction } from './ui';
import { YouthRow, useYouthSnapshot, youthStyles as s } from './youth-ui';
import { YouthFilesEditor, useYouthUploads } from './youth-files-editor';
import { useYouthMutation } from './youth-mutation';
import { YouthMutationActions, useYouthLeave } from './youth-write-ui';
export function YouthDocumentsScreen({id}:{id:string}){const {token,user}=useSession();return token&&user?<Documents key={`${token}:${id}`} id={id}/>:<Redirect href="/login"/>;}
function Documents({id}:{id:string}) {
 const theme=useTheme(),snapshot=useYouthSnapshot(youthId(id)?`/youth/${id}`:null,(v):v is import('@/types/youth').YouthBasicDetail=>isYouthBasicDetail(v,id));
 const files=useYouthSnapshot(snapshot.data?.permissions.canDownloadYouthDocuments?`/youth/${id}/documents`:null,(v):v is import('@/types/youth').YouthDocuments=>isYouthDocuments(v,id));
 const [base,setBase]=useState<YouthBasic|null>(null),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),latest=useRef<YouthBasic|null>(null);const current=()=>snapshot.current()&&snapshot.verifiedRef.current,canWrite=()=>current()&&!!snapshot.cached.current?.permissions.canManageYouth;
 const uploads=useYouthUploads({targetYouthId:id,current:canWrite,scopeCurrent:snapshot.accountCurrent});
 const clear=()=>{uploads.clear();setBase(null);latest.current=null;files.purge();};
 const mutation=useYouthMutation({current:canWrite,resultGuard:isYouthBasicDetail,onLoss:()=>{clear();snapshot.purge();},onSuccess:value=>{uploads.clear();if(value.result)setBase(value.result.youth);setNotice('결정문 변경이 확정되었습니다.');void snapshot.load();void files.load();}});
 useEffect(()=>{if(snapshot.data){if(!base)setBase(snapshot.data.youth);if(!snapshot.data.permissions.canManageYouth)uploads.clear();if(!snapshot.data.permissions.canDownloadYouthDocuments)files.purge();}},[snapshot.data]);useEffect(()=>{if(snapshot.revoked)clear();},[snapshot.revoked]);
 const confirm=useYouthLeave(uploads.files.length>0||mutation.state!=='idle'||mutation.busy,snapshot.current,()=>mutation.busyRef.current||uploads.busyRef.current);
 const attach=async()=>{if(!canWrite()||mutation.locked||uploads.busyRef.current||!base)return;const ids=uploads.readyIds();if(!ids.length||ids.some(x=>x===null)){setError('선택한 모든 파일의 업로드 준비를 완료하세요.');return;}await mutation.submit({operation:'document.attach',targetId:id,path:`/youth/${id}/decision-documents`,method:'POST',body:{expectedYouthUpdatedAt:base.updatedAt,uploadIds:ids}});};
 const remove=async(document:YouthDocument)=>{if(!canWrite()||mutation.locked||uploads.busyRef.current||!base||!files.current()||!files.verifiedRef.current)return;const yes=await confirm.ask({title:'결정문 삭제',message:`${document.name} 결정문을 삭제합니다.`,confirm:'결정문 삭제',danger:true});if(yes&&canWrite()&&!mutation.busyRef.current&&files.current()&&files.verifiedRef.current)await mutation.submit({operation:'document.delete',targetId:document.id,path:`/youth/decision-documents/${document.id}`,method:'DELETE',body:{youthId:id,expectedYouthUpdatedAt:base.updatedAt,expectedDocumentUpdatedAt:document.updatedAt}});};
 const refresh=async()=>{await snapshot.load();if(current())latest.current=snapshot.cached.current!.youth;await files.load();};
 const adopt=async()=>{const value=latest.current;if(!value||!canWrite()||snapshot.cached.current?.youth!==value)return;const yes=await confirm.ask({title:'최신 결정문 기준',message:'청소년과 파일 목록을 확인했습니다. 선택 파일은 유지하며 최신 청소년 기준으로 명시 등록합니다. 삭제는 최신 파일을 다시 선택하세요.',confirm:'최신 기준 선택'});if(yes&&canWrite()&&snapshot.cached.current?.youth===value&&mutation.useLatest()){setBase(value);setError(null);}};
 return <ScrollView style={[s.screen,{backgroundColor:theme.background}]} contentContainerStyle={s.content}><AccountFeedback error={snapshot.error||files.error||mutation.error||error} message={notice}/>{snapshot.loading||files.loading?<ActivityIndicator color={theme.accent}/>:null}{snapshot.data?<><Text accessibilityRole="header" aria-level={2} style={[s.heading,{color:theme.text}]}>{snapshot.data.youth.name} 결정문</Text>{snapshot.data.permissions.canDownloadYouthDocuments?files.data?<>{files.data.documents.map(document=><YouthRow key={document.id} title={document.name} detail={youthFileSize(document.size)} disabled={mutation.locked||uploads.busy} onPress={()=>{if(current()&&files.current()&&files.verifiedRef.current&&!mutation.busyRef.current&&!uploads.busyRef.current)router.push(`/youth/decision-documents/${document.id}?youthId=${id}` as never);}}/>)}{files.data.documents.length===0?<Text style={[s.body,{color:theme.secondary}]}>등록된 결정문이 없습니다.</Text>:null}{canWrite()?files.data.documents.map(document=><TextAction key={document.id} label={`${document.name} 결정문 삭제`} disabled={mutation.locked||uploads.busy} onPress={()=>void remove(document)}/>):null}</>:!files.loading?<Text style={[s.body,{color:theme.secondary}]}>결정문 목록을 확인할 수 없습니다.</Text>:null:<Text style={[s.body,{color:theme.secondary}]}>결정문 열람 권한이 없습니다. 관리 권한으로 새 파일을 첨부할 수 있습니다.</Text>}{canWrite()?<><YouthFilesEditor uploads={uploads} disabled={mutation.locked}/><PrimaryButton title="준비된 결정문 등록" disabled={mutation.locked||uploads.busy||uploads.files.length===0} onPress={()=>void attach()}/></>:null}</>:!snapshot.loading?<Text style={[s.body,{color:theme.secondary}]}>청소년 권한을 확인할 수 없습니다.</Text>:null}<YouthMutationActions mutation={mutation} onRefresh={refresh} onAdopt={()=>void adopt()}/><TextAction label="결정문 권한과 목록 다시 확인" onPress={()=>void refresh()}/>{confirm.dialog}</ScrollView>;
}
