/* Scope cleanup effects intentionally depend on the permission snapshot or token; render-created action callbacks would retrigger them and discard dirty input. */
/* eslint-disable react-hooks/exhaustive-deps */
/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */
/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { registerYouthResource } from '@/lib/youth-privacy';
import { youthPrivateFailure, youthResponseError } from '@/lib/youth';
import { useYouth } from './youth-provider';
export function YouthRow({title,detail,onPress,disabled=false}:{title:string;detail?:string;onPress:()=>void;disabled?:boolean}) {
  const theme=useTheme(),[focus,setFocus]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={detail?`${title} · ${detail}`:title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)} style={({pressed})=>[styles.row,{borderColor:focus?theme.accent:theme.border,backgroundColor:focus||pressed?theme.accentSoft:theme.surface,opacity:disabled?0.5:1}]}><Text style={[styles.label,{color:theme.accent}]}>{title}</Text>{detail?<Text style={[styles.small,{color:theme.secondary}]}>{detail}</Text>:null}</Pressable>;
}
export function YouthField({label,value,onChange,error,disabled=false,multiline=false,hint,placeholder}:{label:string;value:string;onChange:(value:string)=>void;error?:string;disabled?:boolean;multiline?:boolean;hint?:string;placeholder?:string}) {
  const theme=useTheme(),[focus,setFocus]=useState(false);
  return <View style={styles.field}><Text style={[styles.label,{color:theme.text}]}>{label}</Text>{hint?<Text style={[styles.small,{color:theme.secondary}]}>{hint}</Text>:null}<TextInput accessibilityLabel={label} accessibilityHint={hint} aria-invalid={!!error} value={value} onChangeText={onChange} editable={!disabled} multiline={multiline} textAlignVertical={multiline?'top':'center'} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)} placeholder={placeholder} placeholderTextColor={theme.muted} style={[styles.input,multiline&&{minHeight:120},{color:theme.text,backgroundColor:theme.surface,borderColor:error?theme.danger:focus?theme.accent:theme.muted}]} />{error?<Text style={[styles.small,{color:theme.danger}]}>{error}</Text>:null}</View>;
}
export const youthStyles=StyleSheet.create({screen:{flex:1},content:{padding:12,gap:10},heading:{fontSize:18,fontWeight:'700'},body:{fontSize:15,lineHeight:23},small:{fontSize:13,lineHeight:20,fontVariant:['tabular-nums']},actions:{flexDirection:'row',flexWrap:'wrap',gap:6},bar:{paddingHorizontal:12,paddingTop:8,borderTopWidth:1},section:{gap:6}});
const styles=StyleSheet.create({row:{minHeight:64,padding:8,borderBottomWidth:1,borderWidth:1,borderRadius:8,gap:4},label:{fontSize:15,fontWeight:'700',lineHeight:22,flexShrink:1},small:{fontSize:13,lineHeight:20,fontVariant:['tabular-nums']},field:{gap:4},input:{minHeight:44,borderWidth:1.5,borderRadius:8,padding:10,fontSize:16}});
/** Fresh focus is a permission boundary; cached body never flashes before GET. */
export function useYouthSnapshot<T>(path:string|null,validator:(value:unknown)=>value is T) {
  const {request,foreground,isCurrentAccount,isForeground}=useYouth(),{token}=useSession();
  const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[verified,setVerified]=useState(false);
  const [revoked,setRevoked]=useState(0);
  const alive=useRef(false),focused=useRef(false),generation=useRef(0),controller=useRef<AbortController|null>(null),check=useRef(validator),dataRef=useRef<T|null>(null),verifiedRef=useRef(false);
  check.current=validator;
  const accountCurrent=useCallback(()=>alive.current&&focused.current&&isCurrentAccount(),[isCurrentAccount]);
  const current=useCallback(()=>alive.current&&focused.current&&isCurrentAccount()&&isForeground(),[isCurrentAccount,isForeground]);
  const purge=useCallback(()=>{generation.current++;controller.current?.abort();dataRef.current=null;verifiedRef.current=false;setData(null);setVerified(false);setLoading(false);},[]);
  useEffect(()=>{alive.current=true;generation.current++;const off=token?registerYouthResource(token,purge):()=>{};return()=>{alive.current=false;generation.current++;controller.current?.abort();off();};},[token,purge]);
  const load=useCallback(async()=>{
    if(!path||!current())return;
    const epoch=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    verifiedRef.current=false;setVerified(false);setLoading(true);setError(null);
    try { const value=await request<unknown>(path,{signal:abort.signal});if(epoch!==generation.current||!current())return;if(!check.current(value))throw youthResponseError();dataRef.current=value;setData(value);verifiedRef.current=true;setVerified(true); }
    catch(cause){if(epoch!==generation.current||!current())return;if(youthPrivateFailure(cause)){dataRef.current=null;setData(null);setRevoked(value=>value+1);}setError(cause instanceof Error?cause.message:'청소년 정보를 확인하지 못했습니다.');}
    finally{if(epoch===generation.current&&current())setLoading(false);}
  },[path,current,request]);
  useFocusEffect(useCallback(()=>{focused.current=true;verifiedRef.current=false;setVerified(false);if(foreground)void load();return()=>{focused.current=false;verifiedRef.current=false;generation.current++;controller.current?.abort();setVerified(false);};},[foreground,load]));
  return {data:verified&&foreground?data:null,cached:dataRef,loading,error,revoked,verified:verified&&foreground,current,accountCurrent,verifiedRef,load,purge,request};
}
