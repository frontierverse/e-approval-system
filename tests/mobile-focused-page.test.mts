import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";

// A minimal hook scheduler controls focus and deferred responses without a network.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key="__mobileFocusedPageHarness";
const state: Row={};
function reset() { Object.assign(state,{slots:[],cursor:0,requests:[],focus:null,cleanup:null,dependencies:null,token:"session-a",user:{id:"director-a"}}); }
reset();
const same=(a:unknown[],b:unknown[])=>a.length===b.length&&a.every((value,i)=>value===b[i]);
const request=(path:string)=>new Promise((resolve,reject)=>state.requests.push({path,resolve,reject}));
(globalThis as Row)[key]={
  useRef(initial:unknown) { const i=state.cursor++; return state.slots[i] ??= {current:initial}; },
  useState(initial:unknown) { const i=state.cursor++; if (!(i in state.slots)) state.slots[i]=initial; return [state.slots[i],(value:unknown)=>{state.slots[i]=value;}]; },
  useCallback(callback:unknown,dependencies:unknown[]) {
    const i=state.cursor++,old=state.slots[i];
    if(!old||!same(old.dependencies,dependencies)) state.slots[i]={callback,dependencies};
    return state.slots[i].callback;
  },
  useSession:()=>({request,token:state.token,user:state.user}),
  ApiError:class extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status;}},
  useFocusEffect(callback:unknown) { state.focus=callback; },
};
let source=readFileSync(new URL("../mobile/src/lib/use-focused-page.ts",import.meta.url),"utf8");
source=source.replace('import { useFocusEffect } from "expo-router";',`const {useFocusEffect}=globalThis.${key};`)
  .replace('import { useCallback, useRef, useState } from "react";',`const {useCallback,useRef,useState}=globalThis.${key};`)
  .replace('import { useSession } from "./session";',`const {useSession}=globalThis.${key};`)
  .replace('import { ApiError } from "./api";',`const {ApiError}=globalThis.${key};`);
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {useFocusedPage: readPageState}=await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
function renderPage(path:string) {state.cursor=0;return readPageState(path);}
function focus() {state.cleanup?.();state.cleanup=state.focus();}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
beforeEach(reset);
after(()=>{delete (globalThis as Row)[key];});
test("late search responses cannot overwrite the current query or its loading state",async()=>{
  renderPage("/inbox?q=slow");focus();
  renderPage("/inbox?q=current");focus();
  state.requests[1].resolve({total:1,documents:[{id:"current"}]});await tick();
  assert.equal(renderPage("/inbox?q=current").data.documents[0].id,"current");
  state.requests[0].resolve({total:99,documents:[{id:"stale"}]});await tick();
  const current=renderPage("/inbox?q=current");
  assert.equal(current.data.documents[0].id,"current");assert.equal(current.loading,false);
});
test("returning from detail refreshes the same filters and discards responses from an unfocused screen",async()=>{
  const path="/inbox?q=김하늘&sort=oldest&page=4";
  renderPage(path);focus();state.requests[0].resolve({total:61,page:4});await tick();
  renderPage(path);focus();state.cleanup();state.cleanup=null;
  state.requests[1].resolve({total:999,page:4});await tick();
  assert.equal(renderPage(path).data.total,61);
  focus();assert.equal(state.requests[2].path,path);
  state.requests[2].resolve({total:60,page:3});await tick();
  assert.equal(renderPage(path).data.page,3);
});
test("refresh errors retain the current page and retry recovers without losing criteria",async()=>{
  const path="/inbox?dateFrom=2026-10-01&page=2";
  renderPage(path);focus();state.requests[0].resolve({total:30,page:2});await tick();
  void renderPage(path).reload();state.requests[1].reject(new Error("연결 오류"));await tick();
  const failed=renderPage(path);assert.equal(failed.data.page,2);assert.equal(failed.error,"연결 오류");assert.equal(failed.refreshing,false);
  void failed.reload();assert.equal(state.requests[2].path,path);state.requests[2].resolve({total:29,page:2});await tick();
  assert.equal(renderPage(path).error,null);assert.equal(renderPage(path).data.total,29);
});

test("repeated refresh taps issue one request and preserve the original observation time on failure",async()=>{
  const path="/inbox?page=2";
  renderPage(path);focus();state.requests[0].resolve({total:23,page:2});await tick();
  const ready=renderPage(path),timestamp=ready.loadedAt;
  void ready.reload();void ready.reload();void ready.reload();
  assert.equal(state.requests.length,2);
  state.requests[1].reject(new Error("offline"));await tick();
  const failed=renderPage(path);assert.equal(failed.data.total,23);assert.equal(failed.loadedAt,timestamp);
});
test("permission and session failures discard the list, unlike transport errors",async()=>{
  for(const status of [401,403]){
    reset();const path="/inbox?q=private";
    renderPage(path);focus();state.requests[0].resolve({documents:[{id:"private"}]});await tick();
    void renderPage(path).reload();state.requests[1].reject(new (globalThis as Row)[key].ApiError("denied",status));await tick();
    const failed=renderPage(path);assert.equal(failed.data,null);assert.equal(failed.loadedAt,null);assert.equal(failed.errorStatus,status);
  }
});
test("account switches hide old data before effects run and reject old-account responses",async()=>{
  const path="/inbox";renderPage(path);focus();state.requests[0].resolve({documents:[{id:"account-a"}]});await tick();
  void renderPage(path).reload();
  state.token="session-b";state.user={id:"director-b"};
  assert.equal(renderPage(path).data,null);
  state.requests[1].resolve({documents:[{id:"late-account-a"}]});await tick();
  assert.equal(renderPage(path).data,null);
  focus();state.requests[2].resolve({documents:[{id:"account-b"}]});await tick();
  assert.equal(renderPage(path).data.documents[0].id,"account-b");
});
test("new-condition failures never expose an older condition's list or error",async()=>{
  const old="/inbox?q=old",current="/inbox?q=current";
  renderPage(old);focus();state.requests[0].resolve({documents:[{id:"old"}]});await tick();
  assert.equal(renderPage(current).data,null);focus();state.requests[1].reject(new Error("new search failed"));await tick();
  const failed=renderPage(current);assert.equal(failed.data,null);assert.equal(failed.error,"new search failed");
});
