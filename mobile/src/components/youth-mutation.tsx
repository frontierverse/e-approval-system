/* Scope cleanup effects intentionally depend on the permission snapshot or token; render-created action callbacks would retrigger them and discard dirty input. */
/* eslint-disable react-hooks/exhaustive-deps */
/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/refs */
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { registerYouthResource } from '@/lib/youth-privacy';
import { isYouthMutation, newYouthRequestId, youthPrivateFailure, youthUnknown } from '@/lib/youth';
import type { YouthMutation, YouthOperation } from '@/types/youth';
import type { YouthRequestOptions } from '@/lib/youth-request';
import { useYouth } from './youth-provider';
type Attempt = { requestId:string;operation:YouthOperation;targetId?:string;youthId?:string|null;path:string;method:NonNullable<YouthRequestOptions['method']>;body:Record<string,unknown>|null;uncertain:boolean };
/** Unknown writes can only reuse the immutable attempt or inspect its own proof. */
export function useYouthMutation<T>({current,resultGuard,onSuccess,onLoss}:{current:()=>boolean;resultGuard:(value:unknown)=>value is T;onSuccess:(value:YouthMutation<T>)=>void;onLoss:()=>void}) {
  const {request,isCurrentAccount}=useYouth(),{token}=useSession();
  const attempt=useRef<Attempt|null>(null),busyRef=useRef(false),alive=useRef(false),epoch=useRef(0),revision=useRef(0),callbacks=useRef({current,resultGuard,onSuccess,onLoss});callbacks.current={current,resultGuard,onSuccess,onLoss};
  const [busy,setBusy]=useState(false),[state,setState]=useState<'idle'|'uncertain'|'conflict'>('idle'),[error,setError]=useState<string|null>(null),[fields,setFields]=useState<Record<string,string>>({});
  useEffect(()=>{alive.current=true;epoch.current++;const off=token?registerYouthResource(token,()=>{epoch.current++;busyRef.current=false;setBusy(false);if(attempt.current){attempt.current.body=null;attempt.current.uncertain=true;}callbacks.current.onLoss();}):()=>{};return()=>{alive.current=false;epoch.current++;off();};},[token]);
  const valid=()=>alive.current&&isCurrentAccount()&&callbacks.current.current();
  const renderRevision=revision.current;
  const accept=(value:unknown,pending:Attempt)=>{if(!isYouthMutation(value,pending,callbacks.current.resultGuard))throw new ApiError('저장 결과를 확인하지 못했습니다. 원래 요청의 결과를 확인하세요.',200);attempt.current=null;revision.current++;setState('idle');setError(null);setFields({});callbacks.current.onSuccess(value);};
  const fail=(cause:unknown,pending:Attempt,check=false)=>{
    if(!alive.current||!isCurrentAccount())return;
    if(check&&cause instanceof ApiError&&cause.status===404){pending.uncertain=true;setState('uncertain');}
    else if(youthPrivateFailure(cause)){pending.body=null;pending.uncertain=true;callbacks.current.onLoss();setState('uncertain');}
    else if(cause instanceof ApiError&&cause.status===409&&!pending.uncertain&&['YOUTH_CONFLICT','SCHEDULE_CONFLICT'].includes(cause.code??'')){setState('conflict');}
    else if(pending.uncertain||youthUnknown(cause)){pending.uncertain=true;setState('uncertain');}
    else{attempt.current=null;revision.current++;setState('idle');}
    setError(cause instanceof Error?cause.message:'저장 결과가 불명확합니다. 원래 요청으로 결과를 확인하세요.');setFields(cause instanceof ApiError?cause.fields??{}:{});
  };
  const run=async(pending:Attempt,check:boolean,recover=false)=>{
    if(busyRef.current||!valid()||(!check&&!pending.body))return;
    const generation=epoch.current;busyRef.current=true;setBusy(true);setError(null);
    try {
      let value: unknown;
      if(recover) {
        try { value=await request<unknown>(`/youth/mutations/${pending.requestId}`); }
        catch(cause) {
          if(!(cause instanceof ApiError)||cause.status!==404||generation!==epoch.current||!valid()||!pending.body)throw cause;
          value=await request<unknown>(pending.path,{method:pending.method,body:pending.body});
        }
      } else value=await request<unknown>(check?`/youth/mutations/${pending.requestId}`:pending.path,check?{}:{method:pending.method,body:pending.body});
      if(generation!==epoch.current||!valid())throw new ApiError('원래 저장 요청의 결과를 다시 확인하세요.',0);
      accept(value,pending);
    }
    catch(cause){if(generation===epoch.current)fail(cause,pending,check);}
    finally{if(generation===epoch.current){busyRef.current=false;setBusy(false);}}
  };
  const submit=async(value:{operation:YouthOperation;targetId?:string;youthId?:string|null;path:string;method:Attempt['method'];body:Record<string,unknown>})=>{
    if(renderRevision!==revision.current||busyRef.current||attempt.current||!valid())return;
    const requestId=newYouthRequestId();const body=JSON.parse(JSON.stringify({...value.body,requestId})) as Record<string,unknown>;
    const parent=value.operation.startsWith('profile.')||value.operation==='document.attach'?value.targetId:value.operation.startsWith('personal.')?body.youthId??value.path.match(/^\/youth\/([^/]+)\/personal-schedules$/)?.[1]:value.operation==='concept.check'?value.path.match(/^\/youth\/([^/]+)\/learning\//)?.[1]:value.operation.startsWith('rule.')?body.targetYouthId:value.operation==='document.delete'?body.youthId:undefined;
    const pending:Attempt={...value,...(parent===null||typeof parent==='string'?{youthId:parent}:{}),body,requestId,uncertain:false};attempt.current=pending;await run(pending,false);
  };
  const retry=()=>attempt.current?run(attempt.current,false,attempt.current.uncertain):Promise.resolve();
  const check=()=>attempt.current?run(attempt.current,true):Promise.resolve();
  const useLatest=()=>{if(!valid()||busyRef.current||state!=='conflict'||attempt.current?.uncertain)return false;attempt.current=null;revision.current++;setState('idle');setError(null);setFields({});return true;};
  return {submit,retry,check,useLatest,busy,busyRef,state,error,fields,pending:attempt,locked:busy||state!=='idle',clearValidation:()=>{if(!busyRef.current&&state==='idle'){setError(null);setFields({});}}};
}
