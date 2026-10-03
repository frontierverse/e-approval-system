import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import * as core from "../mobile/src/lib/attachment-file.ts";

const content = Buffer.from("Original office file 원본");
const headers = { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "Content-Length": String(content.length), "Content-Disposition": "attachment; filename=report.docx; filename*=UTF-8''%EA%B8%B0%EC%95%88%EC%84%9C.docx" };

test("authoritative UTF-8 names retain extension while traversal and invisible controls cannot escape a directory", () => {
  assert.equal(core.attachmentDownloadInfo(headers,"untrusted-name").name,"기안서.docx");
  for (const value of ["../../비밀.hwp", "C:\\folder\\file.xlsx", "\u202e비밀.pdf\u0000", ".hidden.doc", "..", " / "]) {
    const safe = core.safeAttachmentFilename(value);
    assert.ok(safe && safe !== "." && safe !== "..");
    assert.doesNotMatch(safe,/[\\/\u0000\u202e]/);
    assert.ok(Buffer.byteLength(safe)<=180);
  }
  const large = core.safeAttachmentFilename("가".repeat(200)+".hwpx");
  assert.ok(Buffer.byteLength(large)<=180);
  assert.ok(large.endsWith(".hwpx"));
});
test("malformed disposition cannot turn a server error body into an exported attachment", () => {
  assert.throws(()=>core.attachmentDownloadInfo({"Content-Type":"text/html"},"id"));
  assert.equal(core.attachmentDownloadInfo({"Content-Disposition":"attachment; filename=fallback.hwp; filename*=UTF-8''%ZZ"},"id").name,"fallback.hwp");
  assert.equal(core.attachmentDownloadInfo({"Content-Disposition":'attachment; filename="name;part.xlsx"'},"id").name,"name;part.xlsx");
  assert.deepEqual(core.attachmentDownloadInfo({"CONTENT-DISPOSITION":"attachment; filename=a.pdf","CONTENT-TYPE":"application/pdf; charset=UTF-8","CONTENT-LENGTH":"9007199254740992"},"id"),{name:"a.pdf",mimeType:"application/pdf",size:null});
});
test("duplicate names are preserved and encoded ids do not create extra API path segments",()=>{
  assert.equal(core.availableAttachmentFilename("기안서.docx",["기안서.docx","기안서 (1).docx"]),"기안서 (2).docx");
  assert.equal(core.availableAttachmentFilename("첨부",["첨부"]),"첨부 (1)");
  assert.equal(core.attachmentDownloadPath("id/secret?#"),"/attachments/id%2Fsecret%3F%23/download");
  assert.equal(core.attachmentFileSize(1024),"1.0KB");
  assert.equal(core.attachmentFileSize(1024*1024),"1.0MB");
  assert.equal(core.attachmentFileSize(null),"크기 확인 중");
});
test("unknown transfer lengths stay indeterminate instead of announcing false completion",()=>{
  for (const total of [-1,0,Infinity,NaN]) assert.equal(core.transferProgress(50,total),null);
  assert.equal(core.transferProgress(25,100),.25);
  assert.equal(core.transferProgress(200,100),1);
  assert.equal(core.transferProgress(-10,100),null);
});

// Exercise the production native helper with native modules replaced at their boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const state: Row = {nodes:new Map(),requests:[],shares:[],timers:[],platform:"android",status:200,headers,content,pickerError:null,held:false,corruptCopy:false};
const nodes = () => state.nodes as Map<string,{kind:"directory"|"file";data?:Buffer;name?:string;parent?:string}>;
function uriOf(parts: (string|{uri:string})[]) {
  return parts.map((part,index)=>typeof part==="string" ? (index ? encodeURIComponent(part) : part.replace(/\/$/,"")) : part.uri.replace(/\/$/,"")).join("/");
}
class FakeFile {
  uri: string;
  constructor(...parts:(string|{uri:string})[]) {this.uri=uriOf(parts);}
  get exists() {return nodes().has(this.uri);}
  get size() {return nodes().get(this.uri)?.data?.length??0;}
  get name() {return decodeURIComponent(this.uri.split("/").at(-1)!);}
  delete() {nodes().delete(this.uri);}
  async move(to:FakeFile) {nodes().set(to.uri,nodes().get(this.uri)!);nodes().delete(this.uri);this.uri=to.uri;}
  open() {
    const uri=this.uri;let offset=0;
    state.openHandles+=1;
    return {readBytes(length:number){const bytes=nodes().get(uri)!.data!.subarray(offset,offset+length);offset+=bytes.length;return new Uint8Array(bytes);},
      writeBytes(bytes:Uint8Array){if(!state.corruptCopy)nodes().set(uri,{...nodes().get(uri)!,data:Buffer.concat([nodes().get(uri)!.data!,Buffer.from(bytes)])});state.onWrite?.();},
      close(){state.openHandles-=1;}};
  }
}
class FakeDirectory {
  uri:string;
  constructor(...parts:(string|{uri:string})[]) {this.uri=uriOf(parts);}
  get exists() {return nodes().has(this.uri);}
  get name() {return decodeURIComponent(this.uri.split("/").at(-1)!);}
  create() {nodes().set(this.uri,{kind:"directory"});}
  delete() {for (const uri of nodes().keys()) if (uri===this.uri||uri.startsWith(this.uri+"/"))nodes().delete(uri);}
  list() {return [...nodes()].filter(([uri,node])=>node.parent===this.uri||(uri.startsWith(this.uri+"/")&&!uri.slice(this.uri.length+1).includes("/"))).map(([uri,node])=>node.kind==="file"?new FakeFile(uri):new FakeDirectory(uri));}
  info() {return {exists:true,files:state.noDirectoryNames?undefined:this.list().map(file=>nodes().get(file.uri)?.name??file.name)};}
  createFile(name:string) {
    assert.equal(this.info().files?.includes(name),false,"Existing destination must never be overwritten");
    const file=new FakeFile(`content://provider/document/opaque-${++state.nextFileId}`);
    nodes().set(file.uri,{kind:"file",data:Buffer.alloc(0),parent:this.uri,name});return file;
  }
  static async pickDirectoryAsync() {state.pickerCalls+=1;if(state.pickerError)throw state.pickerError;return new FakeDirectory("content://provider/tree/chosen");}
}
class FakeApiError extends Error {constructor(message:string,public status:number){super(message);}}
const key="__attachmentTransferHarness";
const harness:Row={
  ...core,Directory:FakeDirectory,File:FakeFile,FileMode:{ReadOnly:"r",WriteOnly:"w"},Paths:{cache:"file:///cache"},
  Platform:{get OS(){return state.platform;}},ApiError:FakeApiError,apiUrl:(path:string)=>`https://server.example/api/mobile${path}`,
  Sharing:{async isAvailableAsync(){return state.available;},async shareAsync(uri:string,options:Row){state.shares.push({uri,options,bytes:nodes().get(uri)?.data});if(state.shareError)throw state.shareError;}},
  ReactNativeBlobUtil:{config(config:Row){return {fetch(method:string,url:string,requestHeaders:Row){
    state.requests.push({config,method,url,headers:requestHeaders});
    let resolve!:(value:Row)=>void;let reject!:(error:Error)=>void;
    const promise:Row=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const finish=()=>{nodes().set(`file://${config.path}`,{kind:"file",data:Buffer.from(state.content)});resolve({info:()=>({status:state.status,headers:state.headers})});};
    state.finish=finish;
    promise.progress=(_config:Row,callback:(received:number,total:number)=>void)=>{callback(3,state.content.length);return promise;};
    promise.cancel=()=>reject(new Error("cancelled native fetch"));
    if(!state.held)queueMicrotask(finish);
    return promise;
  }};}},
  setTimeout:(fn:()=>void,ms:number)=>{if(ms===0)queueMicrotask(fn);else state.timers.push({fn,ms});},
};
(globalThis as Row)[key]=harness;
let source=readFileSync(new URL("../mobile/src/lib/attachment-transfer.native.ts",import.meta.url),"utf8");
source=source.replace(/^import[\s\S]*?from "\.\/attachment-file";\n/,`const {Directory,File,FileMode,Paths,Sharing,Platform,ReactNativeBlobUtil,ApiError,apiUrl,attachmentDownloadInfo,attachmentDownloadPath,availableAttachmentFilename,isAttachmentTransferCancellation,transferProgress,setTimeout}=globalThis.${key};\n`);
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const native=await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
beforeEach(async()=>{
  await native.clearAttachmentTransferCache();
  Object.assign(state,{nodes:new Map(),requests:[],shares:[],timers:[],platform:"android",status:200,headers,content,pickerError:null,pickerCalls:0,held:false,corruptCopy:false,available:true,shareError:null,openHandles:0,onWrite:null,nextFileId:0,noDirectoryNames:false});
  new FakeDirectory("file:///cache").create();new FakeDirectory("content://provider/tree/chosen").create();
});
after(async()=>{await native.clearAttachmentTransferCache();delete (globalThis as Row)[key];});
const input={id:"attachment/id",token:"private-token",action:"save" as const};
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));

test("authenticated Android save copies exact original bytes with the authoritative name and no private cache left",async()=>{
  const progress:(number|null)[]=[];
  const transfer=native.startAttachmentTransfer({...input,onProgress:(fraction:number|null)=>progress.push(fraction)});
  assert.equal(await transfer.promise,"기안서.docx 파일을 저장했습니다.");
  assert.deepEqual(nodes().get("content://provider/document/opaque-1")?.data,content);
  assert.equal([...nodes().keys()].some(uri=>uri.includes("op-")),false);
  assert.deepEqual(state.requests[0].headers,{Authorization:"Bearer private-token",Accept:"application/octet-stream"});
  assert.equal(state.requests[0].config.followRedirect,false);
  assert.equal(state.requests[0].url,"https://server.example/api/mobile/attachments/attachment%2Fid/download");
  assert.equal(state.requests[0].url.includes("private-token"),false);
  assert.ok(progress.includes(null));assert.equal(progress.at(-1),1);assert.equal(state.openHandles,0);
});
test("repeated Android saves retain the existing user's file",async()=>{
  await native.startAttachmentTransfer(input).promise;
  const original=nodes().get("content://provider/document/opaque-1");
  assert.equal(await native.startAttachmentTransfer(input).promise,"기안서 (1).docx 파일을 저장했습니다.");
  assert.equal(nodes().get("content://provider/document/opaque-1"),original);
});
test("401 and 403 downloads never write a user-visible file or invoke a share target",async()=>{
  for(const status of [401,403]) {
    state.status=status;
    const transfer=native.startAttachmentTransfer({...input,action:"share"});
    await assert.rejects(transfer.promise,(error:Error)=>error instanceof FakeApiError&&error.status===status);
    assert.equal(state.shares.length,0);
    assert.equal([...nodes().keys()].some(uri=>uri.includes("op-")),false);
    assert.equal(new FakeDirectory("content://provider/tree/chosen").list().length,0);
  }
});
test("missing filename and truncated bodies cannot be exported",async()=>{
  for(const responseHeaders of [{"Content-Type":"text/html"},{...headers,"Content-Length":String(content.length+1)}]) {
    state.headers=responseHeaders;
    await assert.rejects(native.startAttachmentTransfer({...input,action:"share"}).promise);
    assert.equal(state.shares.length,0);assert.equal([...nodes().keys()].some(uri=>uri.includes("op-")),false);
  }
});
test("picker cancellation performs no network request and is a silent cancellation",async()=>{
  state.pickerError=Object.assign(new Error("cancelled"),{code:"ERR_PICKER_CANCELLED"});
  assert.equal(await native.startAttachmentTransfer(input).promise,null);
  assert.equal(state.requests.length,0);
});
test("download cancellation removes partial private data without reporting a failure",async()=>{
  state.held=true;
  const transfer=native.startAttachmentTransfer(input);
  await tick();assert.equal(state.requests.length,1);
  transfer.cancel();
  assert.equal(await transfer.promise,null);
  assert.equal([...nodes().keys()].some(uri=>uri.includes("op-")),false);
  assert.equal(new FakeDirectory("content://provider/tree/chosen").list().length,0);
});
test("logout cancels active downloads and removes both active and previously shared caches",async()=>{
  await native.startAttachmentTransfer({...input,action:"share"}).promise;
  assert.equal(state.shares.length,1);
  state.held=true;
  const pending=native.startAttachmentTransfer({...input,action:"share"});
  await tick();await native.clearAttachmentTransferCache();
  assert.equal(await pending.promise,null);
  assert.equal([...nodes().keys()].some(uri=>uri.includes("attachment-transfers")),false);
});
test("sharing sends only the authenticated local file and retains it until the receiver can read",async()=>{
  assert.equal(await native.startAttachmentTransfer({...input,action:"share"}).promise,"파일 공유 창을 열었습니다.");
  const shared=state.shares[0];
  assert.ok(shared.uri.startsWith("file:///cache/attachment-transfers/"));
  assert.equal(shared.uri.includes(input.token),false);assert.equal(shared.uri.includes("server.example"),false);
  assert.deepEqual(shared.bytes,content);assert.equal(shared.options.mimeType,headers["Content-Type"]);
  assert.equal(nodes().has(shared.uri),true);
  assert.equal(state.pickerCalls,0);
  assert.equal(state.timers[0].ms,10*60*1000);
  state.timers[0].fn();assert.equal(nodes().has(shared.uri),false);
});
test("iOS save opens the native Files sharing flow without claiming an unobserved save",async()=>{
  state.platform="ios";
  const result=await native.startAttachmentTransfer(input).promise;
  assert.equal(result,"파일 저장 창을 열었습니다.");assert.equal(state.pickerCalls,0);
  assert.equal(state.shares[0].options.dialogTitle,"파일에 저장");
});
test("failed save removes only its newly created output, and failed share removes its cache",async()=>{
  state.corruptCopy=true;
  await assert.rejects(native.startAttachmentTransfer(input).promise);
  assert.equal(new FakeDirectory("content://provider/tree/chosen").list().length,0);assert.equal(state.openHandles,0);
  state.corruptCopy=false;state.shareError=new Error("native chooser failed");
  await assert.rejects(native.startAttachmentTransfer({...input,action:"share"}).promise);
  assert.equal([...nodes().keys()].some(uri=>uri.includes("op-")),false);
});

test("cancelling while saving a large file closes both handles and removes only the partial output",async()=>{
  state.content=Buffer.alloc(3*1024*1024,42);state.headers={...headers,"Content-Length":String(state.content.length)};
  const transfer=native.startAttachmentTransfer(input);
  state.onWrite=()=>transfer.cancel();
  assert.equal(await transfer.promise,null);
  assert.equal(state.openHandles,0);assert.equal(new FakeDirectory("content://provider/tree/chosen").list().length,0);
  assert.equal([...nodes().keys()].some(uri=>uri.includes("op-")),false);
});


test("opaque SAF document ids are separate from display names, and unavailable names never permit overwriting",async()=>{
  await native.startAttachmentTransfer(input).promise;
  const folder=new FakeDirectory("content://provider/tree/chosen");
  assert.equal(folder.list()[0].name,"opaque-1");assert.deepEqual(folder.info().files,["기안서.docx"]);
  state.noDirectoryNames=true;
  await assert.rejects(native.startAttachmentTransfer(input).promise);
  assert.equal(folder.list().length,1);assert.deepEqual(nodes().get("content://provider/document/opaque-1")?.data,content);
});
