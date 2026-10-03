import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { attachment, filePolicy, loadChatFileCore, loadChatFileModule, message, response, tick } from "./helpers/mobile-chat-file.mjs";

type TestElement = {
  style: Record<string,string>; files: File[]; removed:boolean; clicked:boolean; appended:boolean; type:string; multiple:boolean; accept:string; href:string; download:string; blob?:Blob;
  addEventListener(name:string,listener:()=>void):void; removeEventListener(name:string):void; remove():void; click():void; emit(name:string):void; listeners:Map<string,()=>void>;
};
function harness() {
  const inputs: TestElement[] = [], anchors: TestElement[] = [], objects = new Map<string, Blob>(), revoked: string[] = [], requests: { url: string; init: RequestInit }[] = [], timers = new Map<number,{callback:()=>void;delay:number}>();
  let id=0, timerId=0, clickFailure=false;
  const pdf = new TextEncoder().encode("%PDF-1.7\nabc");
  const headers = { "Content-Type":"application/pdf", "Content-Disposition":"attachment; filename*=UTF-8''%ED%95%A9%EC%84%B1.pdf", "X-Chat-Download-Token":"receipt-token-123" };
  let handler: (url:string,init:RequestInit)=>Promise<Response> = async url => url.endsWith("/status") ? response({match:true,status:"downloading"}) : url.endsWith("/complete") ? response({message:message({...attachment,status:"deleted"})}) : new Response(pdf,{headers});
  const fetch = async (url: string, init: RequestInit) => {requests.push({url,init});return handler(url,init);};
  const clock = {setTimeout(callback:()=>void,delay:number){const key=++timerId;timers.set(key,{callback,delay});return key;},clearTimeout(key:number){timers.delete(key);}};
  const modules=loadChatFileCore({fetch,...clock});
  const document = {
    body:{appendChild(node:TestElement){node.appended=true;}},
    createElement(tag:string){
      const listeners=new Map<string,()=>void>();
      const element:TestElement={style:{},files:[],removed:false,clicked:false,appended:false,type:"",multiple:false,accept:"",href:"",download:"",addEventListener(name:string,listener:()=>void){listeners.set(name,listener);},removeEventListener(name:string){listeners.delete(name);},remove(){element.removed=true;},click(){element.clicked=true;if(tag==="a"){if(clickFailure)throw new Error("blocked download");element.blob=objects.get(element.href);}},emit(name:string){listeners.get(name)?.();},listeners};
      if(tag==="input")inputs.push(element);else{assert.equal(tag,"a");anchors.push(element);}return element;
    },
  };
  const URLBoundary={createObjectURL(blob:Blob){const uri=`blob:synthetic-chat-${++id}`;objects.set(uri,blob);return uri;},revokeObjectURL(uri:string){objects.delete(uri);revoked.push(uri);}};
  const web=loadChatFileModule("mobile/src/lib/chat-file-transfer.web.ts",{"./api":modules.api,"./attachment-file":modules.attachment,"./chat-file-core":modules.core},{document,URL:URLBoundary,fetch,crypto:webcrypto,...clock});
  async function choose(file=new File([pdf],"합성.pdf",{type:"application/pdf"})){const pending=web.pickChatFile({policy:filePolicy,token:"synthetic-session"}),input=inputs.at(-1)!;input.files=[file];input.emit("change");return pending;}
  const transfer=(extra={})=>web.createChatFileTransfer({attachment,token:"synthetic-session",actorId:"recipient",peerId:"sender",messageId:"message-1",requestId:"request-original",isSender:false,...extra});
  return {web,choose,transfer,inputs,anchors,objects,revoked,requests,timers,pdf,headers,setHandler(fn:typeof handler){handler=fn;},setClickFailure(value:boolean){clickFailure=value;}};
}

test("web picker owns one opaque immutable file and removes cancel/change DOM listeners", async()=>{
  const h=harness(),pending=h.web.pickChatFile({policy:filePolicy,token:"synthetic-session"});h.inputs[0].emit("cancel");assert.equal(await pending,null);assert.equal(h.inputs[0].removed,true);assert.equal(h.inputs[0].listeners.size,0);
  const file=await h.choose();assert.deepEqual(Object.keys(file).sort(),["name","release","size"]);assert.equal(file.size,12);assert.equal(h.inputs[1].multiple,false);assert.ok(h.inputs[1].accept.includes(".zip"));assert.equal(h.inputs[1].removed,true);assert.equal(h.inputs[1].listeners.size,0);file.release();await h.web.clearChatFileResources();
});

test("web small multipart uses original bytes/key and session exclusively in auth header", async()=>{
  const h=harness(),file=await h.choose();h.setHandler(async()=>response({message:message()}));const saved=await h.web.uploadChatFile({file,token:"synthetic-session",actorId:"sender",peerId:"recipient",body:"",requestId:"original-upload"});assert.equal(saved.message.sequence,"90071992547409930");
  const request=h.requests[0],form=request.init.body as FormData;assert.match(request.url,/\/chat\/files$/);assert.equal(request.init.method,"POST");assert.equal(new Headers(request.init.headers).get("Authorization"),"Bearer synthetic-session");assert.equal(new Headers(request.init.headers).get("Content-Type"),null);assert.equal(form.get("requestId"),"original-upload");const actual=form.get("file") as File;assert.equal(actual.name,"합성.pdf");assert.deepEqual(new Uint8Array(await actual.arrayBuffer()),h.pdf);assert.equal(form.get("token"),null);assert.equal(request.url.includes("synthetic-session"),false);file.release();await h.web.clearChatFileResources();
});

test("web ZIP SHA-256 only materializes bounded parts and retry recovers via pure sender status", async()=>{
  const h=harness(),size=4194304+9,source=new File([new Uint8Array(size).fill(42)],"a.zip",{type:"application/zip"});
  const sliced:number[]=[];const originalSlice=source.slice.bind(source);Object.defineProperty(source,"arrayBuffer",{value:()=>{throw new Error("whole ZIP read");}});Object.defineProperty(source,"slice",{value:(start:number,end:number,type:string)=>{const snapshot=originalSlice(start,end,type),slice=snapshot.slice.bind(snapshot);Object.defineProperty(snapshot,"arrayBuffer",{value:()=>{throw new Error("whole snapshot read");}});Object.defineProperty(snapshot,"slice",{value:(offset:number,limit:number)=>{const chunk=slice(offset,limit);sliced.push(chunk.size);assert.ok(chunk.size<=4194304);return chunk;}});return snapshot;}});
  const file=await h.choose(source),id="12345678-1234-1234-1234-123456789abc";let lost=true;
  h.setHandler(async(url,init)=>{if(url.endsWith("/uploads")){if(lost){lost=false;throw new Error("lost response");}throw new Error("must recover instead");}if(url.includes("?requestId="))return response({uploadId:id,uploadedParts:[0]});if(init.method==="PUT")return response({ok:true});return response({message:message({...attachment,originalName:"a.zip",size})});});
  const input={file,token:"synthetic-session",actorId:"sender",peerId:"recipient",body:"",requestId:"original-upload"};await assert.rejects(h.web.uploadChatFile(input),{status:0});await h.web.uploadChatFile(input);assert.deepEqual(sliced,[4194304,9,9]);assert.equal(h.requests.filter(r=>r.init.method==="PUT").length,1);assert.equal((h.requests.find(r=>r.init.method==="PUT")!.init.body as Blob).size,9);assert.equal(h.requests[1].init.method,"GET");file.release();await h.web.clearChatFileResources();
});

test("web actual stream bytes save through Blob anchor requires explicit receipt confirmation", async()=>{
  const h=harness(),op=h.transfer();assert.equal(await op.download(),true);const result=await op.save();assert.equal(result.kind,"handoff");assert.equal(result.requiresConfirmation,true);const anchor=h.anchors[0];assert.equal(anchor.download,"합성.pdf");assert.equal(await anchor.blob!.text(),"%PDF-1.7\nabc");assert.equal(anchor.removed,true);assert.equal(h.objects.size,1);
  await assert.rejects(op.complete(),{status:400});assert.equal(h.requests.length,1);await op.complete({confirmedSaved:true});assert.deepEqual(JSON.parse(h.requests[1].init.body as string),{requestId:"request-original",token:"receipt-token-123"});assert.deepEqual(JSON.parse(h.requests[2].init.body as string),{token:"receipt-token-123"});assert.ok(h.requests.every(r=>!r.url.includes("receipt-token")));await h.web.clearChatFileResources();assert.equal(h.objects.size,0);assert.equal(h.timers.size,0);
});

test("web partial/oversized/401/forged lease responses cannot create export URLs or complete", async()=>{
  for(const mode of ["short","oversized","401","bad-token","bad-length"]){
    const h=harness();h.setHandler(async()=>mode==="401"?response({error:"expired"},401):new Response(new Uint8Array(mode==="short"?11:mode==="oversized"?13:12),{headers:{...h.headers,...(mode==="bad-token"?{"X-Chat-Download-Token":"short"}:{}),...(mode==="bad-length"?{"Content-Length":"11"}:{})}}));
    const op=h.transfer();await assert.rejects(op.download());assert.equal(op.isReady(),false);await assert.rejects(op.save(),{status:400});assert.equal(h.objects.size,0);assert.equal(h.anchors.length,0);assert.equal(h.requests.length,1);await h.web.clearChatFileResources();
  }
});

test("web cancellation during real streaming discards private partial bytes and no export occurs", async()=>{
  const h=harness();let cancelled=false;h.setHandler(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(3));},cancel(){cancelled=true;}}),{headers:h.headers}));
  const op=h.transfer(),pending=op.download();await tick();op.cancel();assert.equal(await pending,false);await tick();assert.equal(cancelled,true);assert.equal(op.isReady(),false);assert.equal(h.objects.size,0);assert.equal(h.anchors.length,0);await h.web.clearChatFileResources();
});

test("web preview uses private authenticated Blob URL, actual MIME magic and account cleanup revokes it", async()=>{
  const h=harness();h.setHandler(async()=>new Response(h.pdf,{headers:{"Content-Type":"application/pdf","Content-Disposition":"inline; filename=preview.pdf"}}));const preview=await h.web.loadChatPreview({attachment,token:"synthetic-session"});assert.equal(preview.kind,"pdf");assert.match(preview.uri,/^blob:/);assert.equal(await h.objects.get(preview.uri)!.text(),"%PDF-1.7\nabc");assert.equal(h.requests[0].init.method,"GET");assert.match(h.requests[0].url,/\/preview$/);assert.equal(h.requests[0].init.body,undefined);preview.release();preview.release();assert.deepEqual(h.revoked,[preview.uri]);await h.web.clearChatFileResources();
  const forged=harness();forged.setHandler(async()=>new Response(new Uint8Array(12),{headers:{"Content-Type":"image/png","Content-Disposition":"inline; filename=fake.png"}}));await assert.rejects(forged.web.loadChatPreview({attachment,token:"synthetic-session"}),{status:415});assert.equal(forged.objects.size,0);await forged.web.clearChatFileResources();
});

test("web hanging fetch deadline and account purge abort requests and settle pending picker synchronously", async()=>{
  const h=harness();let aborted=false;h.setHandler((_url,init)=>{init.signal!.addEventListener("abort",()=>{aborted=true;});return new Promise(()=>{});});const op=h.transfer(),pending=op.download();await tick();const timeout=[...h.timers.values()].find(t=>t.delay===120000)!;timeout.callback();await assert.rejects(pending,{status:0});assert.equal(aborted,true);assert.equal(h.anchors.length,0);
  const chosen=h.web.pickChatFile({policy:filePolicy,token:"synthetic-session"});const cleared=h.web.clearChatFileResources();assert.equal(h.inputs.at(-1)!.removed,true);assert.equal(await chosen,null);await cleared;assert.equal(h.objects.size,0);
});
