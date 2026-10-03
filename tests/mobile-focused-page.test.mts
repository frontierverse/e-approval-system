import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";

// A minimal hook scheduler controls focus and deferred responses without a network.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key="__mobileFocusedPageHarness";
const state: Row={};
function reset() { Object.assign(state,{slots:[],cursor:0,requests:[],focus:null,cleanup:null,dependencies:null}); }
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
  useSession:()=>({request}),
  useFocusEffect(callback:unknown) { state.focus=callback; },
};
let source=readFileSync(new URL("../mobile/src/lib/use-focused-page.ts",import.meta.url),"utf8");
source=source.replace('import { useFocusEffect } from "expo-router";',`const {useFocusEffect}=globalThis.${key};`)
  .replace('import { useCallback, useRef, useState } from "react";',`const {useCallback,useRef,useState}=globalThis.${key};`)
  .replace('import { useSession } from "./session";',`const {useSession}=globalThis.${key};`);
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
