/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/refs */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { registerYouthResource, youthPrivacyGeneration } from '@/lib/youth-privacy';
import { youthAbort, youthRequest, type YouthRequestOptions } from '@/lib/youth-request';
type YouthContextValue = { foreground: boolean; foregroundEpoch: number; isForeground(): boolean; isForegroundCurrent(epoch:number): boolean; isCurrentAccount(): boolean; request<T>(path:string,options?:YouthRequestOptions):Promise<T> };
const YouthContext=createContext<YouthContextValue|null>(null);
export function useYouth() { const value=useContext(YouthContext); if(!value)throw new Error('YouthProvider가 필요합니다.');return value; }
export function YouthProvider({children}:PropsWithChildren) {
  const {token,user,expireSession}=useSession();
  const key=token&&user?`${user.id}:${token}`:'';
  const scope=useRef(key);
  useLayoutEffect(()=>{scope.current=key;},[key]);
  return <AccountYouth key={key} token={token} isAccount={()=>scope.current===key} expireSession={expireSession}>{children}</AccountYouth>;
}
function AccountYouth({token,isAccount,expireSession,children}:PropsWithChildren<{token:string|null;isAccount():boolean;expireSession(token:string):Promise<void>}>) {
  const alive=useRef(false),scopeGeneration=useRef(0),account=useRef(isAccount),requests=useRef(new Set<AbortController>());
  const foregroundRef=useRef(AppState.currentState==='active'),foregroundGeneration=useRef(0);
  const [foregroundEpoch,setForegroundEpoch]=useState(0);
  const [foreground,setForeground]=useState(foregroundRef.current),[ready,setReady]=useState(false);
  useLayoutEffect(()=>{account.current=isAccount;},[isAccount]);
  const isCurrentAccount=useCallback(()=>alive.current&&!!token&&account.current(),[token]);
  const isForeground=useCallback(()=>isCurrentAccount()&&foregroundRef.current,[isCurrentAccount]);
  const isForegroundCurrent=useCallback((epoch:number)=>isForeground()&&epoch===foregroundGeneration.current,[isForeground]);
  const request=useCallback(async<T,>(path:string,options:YouthRequestOptions={}):Promise<T>=>{
    const epoch=scopeGeneration.current,privateEpoch=youthPrivacyGeneration(token ?? ''),foregroundAtStart=foregroundGeneration.current;
    if(!token||!isForegroundCurrent(foregroundAtStart))throw youthAbort();
    const controller=new AbortController(); requests.current.add(controller);
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    try {
      const result=await youthRequest<T>(path,token,{...options,signal:controller.signal});
      if(controller.signal.aborted||epoch!==scopeGeneration.current||privateEpoch!==youthPrivacyGeneration(token ?? '')||!isForegroundCurrent(foregroundAtStart))throw youthAbort();
      return result;
    } catch(cause) {
      if(epoch!==scopeGeneration.current||privateEpoch!==youthPrivacyGeneration(token ?? '')||!isForegroundCurrent(foregroundAtStart))throw youthAbort();
      if(cause instanceof ApiError&&cause.status===401)await expireSession(token);
      throw cause;
    } finally { requests.current.delete(controller);options.signal?.removeEventListener('abort',abort); }
  },[token,isForegroundCurrent,expireSession]);
  useEffect(()=>{
    alive.current=true;scopeGeneration.current++;
    const epoch=scopeGeneration.current;
    const cancel=()=>{scopeGeneration.current++;for(const controller of requests.current)controller.abort();requests.current.clear();};
    const unregister=token?registerYouthResource(token,cancel):()=>{};
    queueMicrotask(()=>{if(alive.current&&epoch===scopeGeneration.current)setReady(true);});
    return()=>{alive.current=false;cancel();unregister();};
  },[token]);
  useEffect(()=>{
    const change=(active:boolean)=>{if(active===foregroundRef.current)return;foregroundRef.current=active;foregroundGeneration.current++;setForegroundEpoch(foregroundGeneration.current);setForeground(active);};
    const state=AppState.addEventListener('change',value=>change(value==='active'));
    const blur=Platform.OS==='android'?AppState.addEventListener('blur',()=>change(false)):null;
    const focus=Platform.OS==='android'?AppState.addEventListener('focus',()=>change(AppState.currentState==='active')):null;
    return()=>{state.remove();blur?.remove();focus?.remove();};
  },[]);
  return <YouthContext.Provider value={{foreground:foreground&&ready,foregroundEpoch,isForeground,isForegroundCurrent,isCurrentAccount,request}}>{children}</YouthContext.Provider>;
}
