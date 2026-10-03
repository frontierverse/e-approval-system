import assert from "node:assert/strict";
import { test } from "node:test";
import { loadChatFileModule } from "./helpers/mobile-chat-file.mjs";
const api=loadChatFileModule("mobile/src/lib/api.ts",{});
function harness(){
  const calls:{url:string;init:RequestInit}[]=[],timers=new Map<number,()=>void>();let timer=0;
  let fetcher:typeof fetch=async()=>new Response(JSON.stringify({ok:true}),{status:200});
  const request=loadChatFileModule("mobile/src/lib/resource-request.ts",{"./api":{...api,apiUrl:(path:string)=>`https://synthetic.example/api/mobile${path}`}},{fetch:(url:string,init:RequestInit)=>{calls.push({url,init});return fetcher(url,init);},setTimeout:(fn:()=>void)=>{const id=++timer;timers.set(id,fn);return id;},clearTimeout:(id:number)=>timers.delete(id)});
  return {...request,calls,timers,setFetch(fn:typeof fetch){fetcher=fn;}};
}
test("actual resource request passes only authenticated JSON with no cache or redirect",async()=>{
 const h=harness();assert.deepEqual(await h.resourceRequest("/resources","synthetic-token",{method:"POST",body:{title:"제목"}}),{ok:true});
 assert.deepEqual(h.calls[0].init.headers,{Authorization:"Bearer synthetic-token",Accept:"application/json","Content-Type":"application/json"});assert.equal(h.calls[0].init.cache,"no-store");assert.equal(h.calls[0].init.redirect,"error");assert.equal(h.timers.size,0);
});
test("invalid success JSON retains actual201 status and structured error fields/code are preserved",async()=>{
 const h=harness();h.setFetch(async()=>new Response("truncated",{status:201}));await assert.rejects(h.resourceRequest("/resources","a"),{status:201});
 h.setFetch(async()=>new Response(JSON.stringify({error:"최신 확인",code:"RESOURCE_CONFLICT",fields:{title:"제목 오류",private:1}}),{status:409}));await assert.rejects(h.resourceRequest("/resources","a"),{status:409,code:"RESOURCE_CONFLICT",fields:{title:"제목 오류"}});assert.equal(h.timers.size,0);
});
test("deadline stops transport even when fetch never responds or ignores signal",async()=>{
 const h=harness();h.setFetch(()=>new Promise(()=>{}));const pending=h.resourceRequest("/resources","a");[...h.timers.values()][0]();await assert.rejects(pending,{status:0});assert.equal(h.calls[0].init.signal?.aborted,true);assert.equal(h.timers.size,0);
});
test("cancel before and during fetch produces AbortError and clears timeout",async()=>{
 for(const early of [true,false]){const h=harness(),controller=new AbortController();h.setFetch(()=>new Promise(()=>{}));if(early)controller.abort();const pending=h.resourceRequest("/resources","a",{signal:controller.signal});if(!early)controller.abort();await assert.rejects(pending,{name:"AbortError"});assert.equal(h.calls.length,early?0:1);assert.equal(h.timers.size,0);}
});
test("serialized byte cap and circular input reject before transport without timer leak",async()=>{
 const h=harness();await assert.rejects(h.resourceRequest("/resources","a",{body:{text:"한".repeat(23000)}}),{status:413});const circular:{self?:unknown}={};circular.self=circular;await assert.rejects(h.resourceRequest("/resources","a",{body:circular}),{status:400});assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);
});
