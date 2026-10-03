import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api";
import * as core from "../mobile/src/lib/resources";
// Actual production TSX logic, lexical React/native/router/API boundaries only.
// No physical chooser, OS keyboard, PDF renderer or browser interaction claim.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key="__resourceActualClientBoundary";const state:Row={};let active:Hooks;
const same=(a:unknown[]|undefined,b:unknown[])=>!!a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function activate(scope:Hooks){active=scope;}
class Hooks {
 slots:Row[]=[];index=0;effects:Row[]=[];tree:Row={};prevent:Row={};props:Row;guard=()=>state.account;
 constructor(public kind:string,props:Row={}){this.props=props;}
 render(){activate(this);this.index=0;this.tree=components[this.kind]({...this.props,isAccount:this.guard});return this.tree;}
 flush(){for(const effect of this.effects.splice(0)){effect.cell.cleanup?.();effect.cell.cleanup=effect.cell.fn();}}
 blur(){for(const cell of this.slots)if(cell.focus)cell.cleanup?.();}
 focus(){for(const cell of this.slots)if(cell.focus)cell.cleanup=cell.fn();}
 unmount(){for(const cell of this.slots)cell.cleanup?.();}
}
const cell=()=>{const i=active.index++;return active.slots[i]??(active.slots[i]={});};
const effect=(fn:()=>unknown,deps:unknown[])=>{const c=cell();c.effect=true;if(!same(c.deps,deps)){c.deps=deps;c.fn=fn;active.effects.push({cell:c});}};
const expireSession=async()=>state.expired++;
const request=async(path:string,options:Row={})=>{state.requests.push({path,...options});return state.onRequest(path,options);};
const provider:Row={foreground:true,isCurrentAccount:()=>state.account,authenticatedRequest:request};
const listeners=new Map<string,Set<(value?:string)=>void>>();
const harness:Row={...core,ApiError,resourceAbort:()=>Object.assign(new Error("stopped"),{name:"AbortError"}),resourceRequest:(path:string,token:string,options:Row)=>request(path,{...options,token}),createContext:()=>({Provider:"ResourceContextProvider"}),useContext:()=>null,AppState:{currentState:"active",addEventListener:(name:string,callback:(value?:string)=>void)=>{const callbacks=listeners.get(name)??new Set();callbacks.add(callback);listeners.set(name,callbacks);return{remove:()=>callbacks.delete(callback)};}},React:{createElement:(type:unknown,props:Row|null,...children:unknown[])=>({type,props:{...props,children}}),Fragment:"Fragment"},
 useRef:(v:unknown)=>{const c=cell();return c.ref??(c.ref={current:v});},useState:(v:unknown)=>{const c=cell();if(!c.state){c.state={value:typeof v==="function"?v():v};c.setter=(next:unknown)=>{c.state.value=typeof next==="function"?next(c.state.value):next;};}return[c.state.value,c.setter];},useCallback:(fn:unknown,deps:unknown[])=>{const c=cell();if(!same(c.deps,deps)){c.deps=deps;c.fn=fn;}return c.fn;},useEffect:effect,useLayoutEffect:effect,useFocusEffect:(fn:()=>unknown)=>{const i=active.index;effect(fn,[fn]);active.slots[i].focus=true;},
 usePreventRemove:(enabled:boolean,callback:unknown)=>{active.prevent={enabled,callback};},useNavigation:()=>({dispatch:(action:unknown)=>state.dispatched.push(action)}),useSafeAreaInsets:()=>({bottom:16}),useConfirmAction:()=>({dialog:null,ask:async(options:Row)=>{state.confirmations.push(options);return state.confirm;}}),
 useResources:()=>provider,useSession:()=>({token:"synthetic-a",user:{id:"actor"},expireSession}),useTheme:()=>({}),Platform:{OS:"android"},
 ActivityIndicator:"ActivityIndicator",ScrollView:"ScrollView",View:"View",Text:"Text",Image:"Image",KeyboardAvoidingView:"KeyboardAvoidingView",ResourceRow:"ResourceRow",ResourceField:"ResourceField",PrimaryButton:"PrimaryButton",TextAction:"TextAction",EmptyState:"EmptyState",AccountFeedback:"AccountFeedback",PdfPreview:"PdfPreview",
 router:{push:(path:unknown)=>state.routes.push(path),replace:(path:unknown)=>state.routes.push(path),setParams:(value:unknown)=>state.params.push(value)},resourceFileSize:(size:number)=>`${size}B`,isResourceFileCancellation:(cause:Error)=>cause.name==="AbortError",discardResourceFile:()=>state.discards++,pickResourceFile:async()=>state.selectedFile,createResourceUpload:()=>state.upload,
 createResourceFileTransfer:(options:Row)=>{state.transfers++;state.transferOptions=options;return state.transfer;},loadResourcePreview:async(options:Row)=>{state.previewRequests.push(options);return state.onPreview(options);},
};
(globalThis as Row)[key]=harness;
async function load(file:string,name:string){const source=readFileSync(new URL(`../mobile/src/components/${file}`,import.meta.url),"utf8");const injected=source.replace(/^import[\s\S]*?;\n/gm,"");const names=Object.keys(harness).filter(k=>!new RegExp(`(?:function|class|const|let)\\s+${k}\\b`).test(injected));const output=ts.transpileModule(`const {${names.join(",")}}=globalThis.${key};\n${injected}\nexport {${name}};`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;return(await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`))[name];}
const components:Row={provider:await load("../providers/ResourceProvider.tsx","AccountResources"),list:await load("ResourcesScreen.tsx","ResourceListContent"),editor:await load("ResourceEditor.tsx","Editor"),detail:await load("ResourceDetailScreen.tsx","ResourceDetailContent"),viewers:await load("ResourceViewersScreen.tsx","Viewers"),file:await load("ResourceAttachmentScreen.tsx","Attachment")};
const iso="2026-10-03T00:00:00.000Z",newer="2026-10-03T00:00:00.001Z",policy={maxFileCount:10,maxFileSizeMb:30,allowedExtensions:[".pdf"]};
function resource(patch:Row={}){return{id:"resource",title:"원래 자료 제목",summary:"PRIVATE_ORIGINAL_CONTENT",category:"corporation",educationLevel:null,pinned:false,createdAt:iso,updatedAt:iso,uniqueViewerCount:1,author:{id:"actor",name:"직원",departmentName:"지원",positionName:"담당"},canManage:true,attachments:[],...patch};}
function mutation(operation="create",patch:Row={}){return{ok:true,message:"저장 확정",replayed:false,operation,outcome:operation==="delete"?"deleted":"present",resourceId:"resource",committedUpdatedAt:operation==="delete"?null:newer,resource:operation==="delete"?null:resource({updatedAt:newer}),cleanupPending:false,...patch};}
const scopes:Hooks[]=[];const tick=()=>new Promise<void>(r=>setImmediate(r));const update=(h:Hooks)=>{h.render();h.flush();};
async function mount(kind:string,props:Row={}){const h=new Hooks(kind,{...props});scopes.push(h);h.render();h.flush();await tick();update(h);return h;}
function nodes(root:unknown):Row[]{if(Array.isArray(root))return root.flatMap(nodes);if(!root||typeof root!=="object")return[];const row=root as Row;return[row,...nodes(row.props?.children)];}
function find(h:Hooks,type:string,label?:string){const row=nodes(h.tree).find(row=>row.type===type&&(!label||row.props.label===label||row.props.title===label));assert.ok(row,`${type} ${label??""}`);return row.props;}
function field(h:Hooks,label:string){return find(h,"ResourceField",label);}
function change(h:Hooks,label:string,value:string){field(h,label).onChange(value);update(h);}
async function press(h:Hooks,label:string){const row=nodes(h.tree).find(row=>row.props.label===label||row.props.title===label);assert.ok(row,label);row.props.onPress();await tick();update(h);}
function deferred(){let resolve!:(value:unknown)=>void,reject!:(cause:Error)=>void;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function writes(){return state.requests.filter((r:Row)=>r.method&&r.method!=="GET");}
beforeEach(()=>{
 for(const scope of scopes.splice(0))scope.unmount();listeners.clear();provider.foreground=true;
 Object.assign(state,{account:true,requests:[],routes:[],params:[],confirm:true,confirmations:[],dispatched:[],expired:0,discards:0,selectedFile:null,transfers:0,previewRequests:[],previewReleases:0,resource:resource()});
 state.onPreview=async()=>({uri:"private-preview",kind:"pdf",mimeType:"application/pdf",release:()=>state.previewReleases++});
 state.onRequest=async(path:string,options:Row)=>path.includes("/views")?{ok:true,replayed:false,resourceId:"resource",uniqueViewerCount:1,viewer:{firstViewedAt:iso,lastViewedAt:iso,visitCount:12}}:path==="/resources/options"?{defaults:{category:"bajaul",educationLevel:null},attachmentPolicy:policy}:path.includes("/editor")?{resource:state.resource,attachmentPolicy:policy}:path.includes("?")?{items:[state.resource],category:"corporation",level:"all",q:"",page:1,pageSize:3,total:1,totalPages:1}:options.method?mutation(options.method==="DELETE"?"delete":options.method==="PUT"?"update":"create"):{resource:state.resource};
 state.transferReady=false;state.transfer={download:async()=>{state.transferReady=true;return true;},save:async()=>"저장 확인",share:async()=>"공유 창을 열었습니다",isReady:()=>state.transferReady,cancel:()=>{},release:()=>{}};
});
after(()=>{for(const scope of scopes)scope.unmount();delete(globalThis as Row)[key];});
test("list default is corporation3 and captures navigation only while fresh/account/focus valid",async()=>{const h=await mount("list");assert.match(state.requests[0].path,/category=corporation/);const callback=find(h,"ResourceRow").onPress;h.blur();callback();state.account=false;callback();assert.equal(state.routes.length,0);});
test("array-normalized invalid query never fetches another default and invalid response cannot become empty",async()=>{await mount("list",{category:""});assert.equal(state.requests.length,0);state.onRequest=async()=>({items:[],category:"corporation",level:"all",q:"",page:1,pageSize:3,total:1,totalPages:1});const h=await mount("list");assert.equal(nodes(h.tree).some(row=>row.type==="EmptyState"),false);assert.ok(find(h,"AccountFeedback").error);});
test("fresh focus503 masks cached rows; refresh403 revokes captured navigation",async()=>{const h=await mount("list"),callback=find(h,"ResourceRow").onPress;h.blur();state.onRequest=async()=>{throw new ApiError("fresh failed",503);};h.focus();await tick();update(h);assert.equal(nodes(h.tree).some(row=>row.type==="ResourceRow"),false);callback();assert.equal(state.routes.length,0);state.onRequest=async()=>{throw new ApiError("revoked",403);};await press(h,"목록 다시 불러오기");callback();assert.equal(state.routes.length,0);});
test("registration defaults bajaul and validation preserves all input without request",async()=>{const h=await mount("editor");change(h,"제목","한");change(h,"내용","보관할 본문 입력");await press(h,"자료 저장");assert.equal(writes().length,0);assert.equal(field(h,"내용").value,"보관할 본문 입력");assert.ok(field(h,"제목").error);});
test("201 response loss freezes original input and same-key retry, never replaces key on later400",async()=>{const h=await mount("editor");change(h,"제목","원래 제목");change(h,"내용","원래 보관 본문");state.onRequest=async()=>{throw new ApiError("lost JSON",201);};await press(h,"자료 저장");const original=writes()[0].body;change(h,"제목","변경 시도");assert.equal(field(h,"제목").value,"원래 제목");state.onRequest=async()=>{throw new ApiError("later invalid",400);};await press(h,"같은 저장 요청 재시도");assert.deepEqual(writes()[1].body,original);assert.ok(find(h,"TextAction","같은 저장 요청 재시도"));});
test("receipt404 never frees original attempt; replay newer live body proves original save",async()=>{const h=await mount("editor");change(h,"제목","원래 제목");change(h,"내용","원래 보관 본문");state.onRequest=async()=>{throw new ApiError("lost",0);};await press(h,"자료 저장");state.onRequest=async(path:string)=>path.includes("mutations")?Promise.reject(new ApiError("none",404)):{defaults:{category:"bajaul",educationLevel:null},attachmentPolicy:policy};await press(h,"원래 저장 결과 확인");assert.equal(field(h,"제목").value,"원래 제목");state.onRequest=async()=>mutation("create",{replayed:true,resource:resource({title:"후속 다른 수정",updatedAt:newer})});await press(h,"원래 저장 결과 확인");assert.ok(find(h,"TextAction","저장한 자료 보기"));assert.equal(writes().length,1);});
test("captured save button cannot create second request after successful acknowledgement",async()=>{const h=await mount("editor");change(h,"제목","저장할 제목");change(h,"내용","저장할 보관 내용");const save=find(h,"PrimaryButton","자료 저장").onPress;save();save();await tick();update(h);assert.equal(writes().length,1);save();await tick();assert.equal(writes().length,1);});
test("known CAS conflict needs explicit latest baseline choice and keeps user's input",async()=>{const h=await mount("editor",{id:"resource"});change(h,"내용","내 보관된 수정 본문");state.onRequest=async()=>{throw new ApiError("conflict",409,undefined,"RESOURCE_CONFLICT");};await press(h,"자료 저장");state.resource=resource({updatedAt:newer,summary:"다른 직원 최신 내용"});state.onRequest=async()=>({resource:state.resource,attachmentPolicy:policy});await press(h,"최신 자료 조회");assert.equal(field(h,"내용").value,"내 보관된 수정 본문");await press(h,"내 입력 유지·최신 수정 기준 선택");state.onRequest=async()=>mutation("update");await press(h,"자료 저장");assert.equal(writes()[1].body.expectedUpdatedAt,newer);assert.equal(writes()[1].body.summary,"내 보관된 수정 본문");assert.notEqual(writes()[0].body.requestId,writes()[1].body.requestId);});
test("prior unknown then CAS409 cannot discard immutable attempt or adopt new baseline",async()=>{const h=await mount("editor",{id:"resource"});change(h,"내용","보존할 변경 내용");state.onRequest=async()=>{throw new ApiError("lost",0);};await press(h,"자료 저장");state.onRequest=async()=>{throw new ApiError("conflict",409,undefined,"RESOURCE_CONFLICT");};await press(h,"같은 저장 요청 재시도");assert.equal(nodes(h.tree).some(row=>row.props.label==="내 입력 유지·최신 수정 기준 선택"),false);assert.deepEqual(writes()[0].body,writes()[1].body);});
test("fresh editor failure masks input and later fresh permission restores memory;404 clears private content",async()=>{const h=await mount("editor",{id:"resource"});change(h,"내용","기억할 개인 입력");h.blur();state.onRequest=async()=>{throw new ApiError("fresh503",503);};h.focus();await tick();update(h);assert.equal(nodes(h.tree).some(row=>row.type==="ResourceField"),false);state.onRequest=async()=>({resource:state.resource,attachmentPolicy:policy});await press(h,"작성 권한·자료 다시 확인");assert.equal(field(h,"내용").value,"기억할 개인 입력");h.blur();state.onRequest=async()=>{throw new ApiError("missing",404);};h.focus();await tick();update(h);assert.equal(JSON.stringify(h.tree).includes("PRIVATE_ORIGINAL_CONTENT"),false);assert.equal(JSON.stringify(h.tree).includes("기억할 개인 입력"),false);});
test("old account save response neither routes nor clears new scope input",async()=>{const h=await mount("editor");change(h,"제목","보존 제목");change(h,"내용","보존할 내용 입력");const pending=deferred();state.onRequest=async()=>pending.promise;find(h,"PrimaryButton","자료 저장").onPress();state.account=false;pending.resolve(mutation());await tick();update(h);assert.equal(state.routes.length,0);assert.equal(nodes(h.tree).some(row=>row.props.label==="저장한 자료 보기"),false);});
test("dirty navigation cancel retains contents and late account confirmation cannot dispatch",async()=>{const h=await mount("editor");change(h,"내용","작성 중 입력");state.confirm=false;h.prevent.callback({data:{action:"BACK"}});await tick();assert.equal(state.dispatched.length,0);assert.equal(field(h,"내용").value,"작성 중 입력");state.confirm=true;h.prevent.callback({data:{action:"BACK"}});state.account=false;await tick();assert.equal(state.dispatched.length,0);});
test("detail visit occurs once per mounted logical visit; refresh/file return are pure",async()=>{const h=await mount("detail",{id:"resource"});assert.equal(writes().filter((r:Row)=>r.path.endsWith("/views")).length,1);await press(h,"자료 새로고침");h.blur();h.focus();await tick();update(h);assert.equal(writes().filter((r:Row)=>r.path.endsWith("/views")).length,1);assert.ok(find(h,"TextAction","확인 직원 1명"));});
test("unknown visit recovery uses original stable key and never hides valid detail",async()=>{state.onRequest=async(path:string)=>path.endsWith("/views")?Promise.reject(new ApiError("visit lost",0)):{resource:state.resource};const h=await mount("detail",{id:"resource"});const first=writes()[0].body;assert.equal(JSON.stringify(h.tree).includes("PRIVATE_ORIGINAL_CONTENT"),true);await press(h,"같은 방문 열람 기록 재시도");assert.deepEqual(writes()[1].body,first);});
test("delete unknown retains original receipt; same-key GET is pure and confirmed deleted hides content",async()=>{const h=await mount("detail",{id:"resource"});state.onRequest=async()=>{throw new ApiError("delete lost",0);};await press(h,"자료 삭제");const original=writes().find((r:Row)=>r.method==="DELETE").body;state.onRequest=async()=>mutation("delete",{replayed:true});await press(h,"삭제 결과 확인");const last=state.requests.at(-1);assert.equal(last.path,`/resources/mutations/${original.requestId}`);assert.equal(last.method,undefined);assert.equal(JSON.stringify(h.tree).includes("PRIVATE_ORIGINAL_CONTENT"),false);});
test("file cold route metadata is authenticated and unsupported preview remains savable",async()=>{state.onRequest=async()=>({attachment:{id:"file",name:"자료.zip",mimeType:"application/zip",size:12,previewKind:"unsupported"}});const h=await mount("file",{id:"file"});assert.equal(state.requests[0].path,"/resources/attachments/file");assert.equal(state.previewRequests.length,0);assert.ok(find(h,"TextAction","내려받기"));});
test("private preview background releases URI, masks file and resume requires fresh GET",async()=>{state.onRequest=async()=>({attachment:{id:"file",name:"PRIVATE_FILENAME.pdf",mimeType:"application/pdf",size:12,previewKind:"pdf"}});const h=await mount("file",{id:"file"});assert.ok(find(h,"PdfPreview"));provider.foreground=false;update(h);assert.equal(nodes(h.tree).some(row=>row.type==="PdfPreview"),false);assert.equal(JSON.stringify(h.tree).includes("PRIVATE_FILENAME"),false);assert.equal(state.previewReleases,1);provider.foreground=true;state.onRequest=async()=>{throw new ApiError("fresh503",503);};update(h);await tick();update(h);assert.equal(nodes(h.tree).some(row=>row.type==="PdfPreview"),false);});
test("system share handoff may temporarily blur AppState without invalidating verified account file scope",async()=>{
 state.onRequest=async()=>({attachment:{id:"file",name:"자료.pdf",mimeType:"application/pdf",size:12,previewKind:"unsupported"}});
 const h=await mount("file",{id:"file"});await press(h,"내려받기");
 const exported=deferred();state.transfer.share=async()=>exported.promise;
 find(h,"TextAction","공유").onPress();provider.foreground=false;update(h);
 assert.equal(state.transferOptions.isCurrent(),true);
 assert.equal(JSON.stringify(h.tree).includes("자료.pdf"),false);
 exported.resolve("공유 창을 열었습니다");await tick();provider.foreground=true;update(h);await tick();update(h);
 assert.ok(find(h,"TextAction","파일 저장"));
});
test("unknown update loses permission: private input removed but minimal receipt proof remains accessible",async()=>{
 const h=await mount("editor",{id:"resource"});change(h,"내용","PRIVATE_UNCERTAIN_INPUT");state.onRequest=async()=>{throw new ApiError("lost",0);};await press(h,"자료 저장");const original=writes()[0].body.requestId;
 state.onRequest=async()=>{throw new ApiError("management revoked",403);};await press(h,"같은 저장 요청 재시도");
 assert.equal(JSON.stringify(h.tree).includes("PRIVATE_UNCERTAIN_INPUT"),false);assert.ok(find(h,"TextAction","원래 저장 결과 확인"));
 state.onRequest=async(path:string)=>{assert.equal(path,`/resources/mutations/${original}`);return mutation("update",{outcome:"deleted",resource:null,replayed:true});};await press(h,"원래 저장 결과 확인");
 assert.equal(writes().length,2);assert.ok(find(h,"TextAction","자료 목록"));
});

test("repeated search query is rejected before any default list request", async () => {
  await mount("list", { q: "", invalidQuery: true });
  assert.equal(state.requests.length, 0);
});
test("known delete CAS conflict requires explicit latest GET before a new delete key", async () => {
  const h = await mount("detail", { id: "resource" });
  const oldDelete = find(h, "TextAction", "자료 삭제").onPress;
  state.onRequest = async () => { throw new ApiError("other edit", 409, undefined, "RESOURCE_CONFLICT"); };
  await press(h, "자료 삭제");
  oldDelete(); await tick(); update(h);
  assert.equal(writes().filter((row:Row) => row.method === "DELETE").length, 1);
  assert.equal(JSON.stringify(h.tree).includes("PRIVATE_ORIGINAL_CONTENT"), false);
  state.onRequest = async (path:string, options:Row) => options.method === "DELETE" ? mutation("delete") : path.endsWith("/views") ? { ok:true,replayed:true,resourceId:"resource",uniqueViewerCount:1,viewer:{firstViewedAt:iso,lastViewedAt:iso,visitCount:1} } : { resource:resource({ updatedAt:newer }) };
  await press(h, "자료 다시 불러오기");
  await press(h, "자료 삭제");
  const deletes = writes().filter((row:Row) => row.method === "DELETE");
  assert.equal(deletes.length, 2);
  assert.equal(deletes[1].body.expectedUpdatedAt, newer);
  assert.notEqual(deletes[1].body.requestId, deletes[0].body.requestId);
});
test("unknown delete followed by permission loss hides body and retains original receipt-only proof", async () => {
  const h = await mount("detail", { id:"resource" });
  state.onRequest = async () => { throw new ApiError("lost", 0); };
  await press(h, "자료 삭제");
  const key = writes().find((row:Row) => row.method === "DELETE").body.requestId;
  state.onRequest = async () => { throw new ApiError("permission revoked", 403); };
  await press(h, "같은 삭제 요청 재시도");
  assert.equal(JSON.stringify(h.tree).includes("PRIVATE_ORIGINAL_CONTENT"), false);
  state.onRequest = async (path:string) => { assert.equal(path, `/resources/mutations/${key}`); return mutation("delete",{replayed:true}); };
  await press(h, "삭제 결과 확인");
  assert.equal(writes().filter((row:Row) => row.method === "DELETE").length, 2);
});
function resourceContext(h:Hooks) { return find(h, "ResourceContextProvider").value; }
test("provider initial readiness and Android blur mask without adding background polling", async () => {
  const h = await mount("provider", { token:"synthetic-a",expireSession });
  assert.equal(resourceContext(h).foreground, true);
  for (const callback of listeners.get("blur")??[]) callback(); update(h);
  assert.equal(resourceContext(h).foreground, false);
  for (const callback of listeners.get("focus")??[]) callback(); update(h);
  assert.equal(resourceContext(h).foreground, true);
  assert.equal(state.requests.length, 0);
  h.unmount();
  assert.equal([...listeners.values()].reduce((sum,set)=>sum+set.size,0),0);
});
test("provider old response and old401 cannot cross account boundary or expire newer account", async () => {
  const h = await mount("provider", { token:"synthetic-a",expireSession });
  const response = deferred(); state.onRequest = () => response.promise;
  const pending = resourceContext(h).authenticatedRequest("/resources/options");
  state.account = false; response.reject(new ApiError("old401",401));
  await assert.rejects(pending,{name:"AbortError"});
  assert.equal(state.expired,0);
});
test("provider StrictMode cleanup/setup invalidates requests even when same account is alive again", async () => {
  const h = await mount("provider", { token:"synthetic-a",expireSession });
  const response = deferred(); state.onRequest = () => response.promise;
  const pending = resourceContext(h).authenticatedRequest("/resources/options");
  h.unmount();
  for (const cell of h.slots) if (cell.effect) cell.cleanup=cell.fn();
  response.resolve({safe:true});
  await assert.rejects(pending,{name:"AbortError"});
  await tick();update(h);
  assert.equal(resourceContext(h).foreground,true);
});
test("provider current401 expires exactly captured token and caller cancellation aborts request", async () => {
  const expired:string[]=[];
  const h = await mount("provider",{token:"captured-a",expireSession:async(token:string)=>expired.push(token)});
  state.onRequest = async () => { throw new ApiError("current401",401); };
  await assert.rejects(resourceContext(h).authenticatedRequest("/resources"),{status:401});
  assert.deepEqual(expired,["captured-a"]);
  const response=deferred();state.onRequest=()=>response.promise;
  const controller=new AbortController();const pending=resourceContext(h).authenticatedRequest("/resources",{signal:controller.signal});
  controller.abort();assert.equal(state.requests.at(-1).signal.aborted,true);response.resolve({ok:true});
  await assert.rejects(pending,{name:"AbortError"});
});

test("pending picker cannot restore a private filename after confirmed management loss", async () => {
  const h=await mount("editor",{id:"resource"}),picked=deferred();let released=0;
  state.selectedFile=picked.promise;find(h,"TextAction","첨부 선택").onPress();
  h.blur();state.onRequest=async()=>{throw new ApiError("revoked",403);};h.focus();await tick();update(h);
  picked.resolve({name:"PRIVATE_LATE_FILE.pdf",size:12,release:()=>released++});await tick();update(h);
  assert.equal(JSON.stringify(h.tree).includes("PRIVATE_LATE_FILE"),false);
  assert.equal(released,1);
});

test("resource rendered copy separates large unique-viewer/visit counts and uses actual newline", async () => {
  state.resource=resource({uniqueViewerCount:1234567});
  state.onRequest=async()=>({resource:state.resource});
  const detail=await mount("detail",{id:"resource"});
  assert.ok(find(detail,"TextAction","확인 직원 1,234,567명"));
  const texts=nodes(detail.tree).filter(row=>row.type==="Text").flatMap(row=>row.props.children).filter((value:unknown)=>typeof value==="string");
  assert.equal(texts.some(value=>value.includes("\\n등록")),false);
  assert.ok(texts.includes("\n"));
  state.onRequest=async()=>({resourceId:"resource",uniqueViewerCount:1234567,items:[{user:{id:"actor",name:"직원",departmentName:"지원",positionName:"담당"},firstViewedAt:iso,lastViewedAt:iso,visitCount:123456}],page:1,pageSize:20,total:1,totalPages:1});
  const viewers=await mount("viewers",{id:"resource"});
  const viewerText=nodes(viewers.tree).filter(row=>row.type==="Text").flatMap(row=>row.props.children).join("");
  assert.match(viewerText,/확인 직원 1,234,567명/);assert.match(viewerText,/방문 123,456회/);
});
test("all resource JSX text excludes literal backslash-newline presentation",()=>{
 for(const filename of ["ResourcesScreen.tsx","ResourceDetailScreen.tsx","ResourceEditor.tsx","ResourceViewersScreen.tsx","ResourceAttachmentScreen.tsx","ResourceContent.tsx"]){
  const source=readFileSync(new URL(`../mobile/src/components/${filename}`,import.meta.url),"utf8"),tree=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const inspect=(node:ts.Node)=>{if(ts.isJsxText(node))assert.equal(node.text.includes("\\n"),false,filename);ts.forEachChild(node,inspect);};inspect(tree);
 }
});

function renderedText(h:Hooks) {
  return nodes(h.tree).filter(row=>row.type==="Text").flatMap(row=>row.props.children.flat(Infinity)).filter(value=>typeof value==="string"||typeof value==="number").join("");
}
function spinnerCount(h:Hooks) { return nodes(h.tree).filter(row=>row.type==="ActivityIndicator").length; }
function emptyList() { return {items:[],category:"corporation",level:"all",q:"",page:1,pageSize:3,total:0,totalPages:1}; }
function viewerList(items:Row[]=[]) { return {resourceId:"resource",uniqueViewerCount:items.length,items,page:1,pageSize:20,total:items.length,totalPages:1}; }
test("empty successful list refresh pending/error is explicitly previous result and never a new confirmed empty",async()=>{
  state.onRequest=async()=>emptyList();const h=await mount("list");assert.ok(find(h,"EmptyState"));
  const waiting=deferred();state.onRequest=()=>waiting.promise;
  find(h,"TextAction","새로고침").onPress();update(h);
  assert.match(renderedText(h),/이전 조회 결과 · 자료 0건/);assert.equal(nodes(h.tree).some(row=>row.type==="EmptyState"),false);
  assert.ok(spinnerCount(h)>0);
  waiting.reject(new ApiError("refresh failed",503));await tick();update(h);
  assert.match(renderedText(h),/이전 조회 결과 · 자료 0건/);assert.match(renderedText(h),/최신 목록을 다시 확인/);
  assert.equal(nodes(h.tree).some(row=>row.type==="EmptyState"),false);assert.equal(spinnerCount(h),0);
  state.onRequest=async()=>emptyList();await press(h,"목록 다시 불러오기");
  assert.ok(find(h,"EmptyState"));assert.doesNotMatch(renderedText(h),/이전 조회 결과/);
});
test("cold list403/503 failures stop loading and never claim zero results or confirmed empty",async()=>{
  for(const status of [403,503]){
    state.onRequest=async()=>{throw new ApiError("unavailable",status);};const h=await mount("list");
    assert.equal(spinnerCount(h),0);assert.match(renderedText(h),/자료 목록 확인 불가/);
    assert.doesNotMatch(renderedText(h),/자료 불러오는 중|자료 0건/);assert.equal(nodes(h.tree).some(row=>row.type==="EmptyState"),false);
  }
});
test("list503 preserves safe previous rows and known management while403 clears both",async()=>{
  const h=await mount("list");state.onRequest=async()=>{throw new ApiError("refresh failed",503);};await press(h,"새로고침");
  assert.ok(find(h,"ResourceRow"));assert.match(renderedText(h),/이전 조회 결과 · 자료 1건/);
  assert.equal(find(h,"TextAction","자료 등록").disabled,false);assert.equal(spinnerCount(h),0);
  state.onRequest=async()=>{throw new ApiError("revoked",403);};await press(h,"목록 다시 불러오기");
  assert.equal(nodes(h.tree).some(row=>row.type==="ResourceRow"),false);assert.equal(find(h,"TextAction","자료 등록").disabled,true);
  assert.match(renderedText(h),/자료 목록 확인 불가/);assert.equal(spinnerCount(h),0);
});
test("viewers empty refresh failure qualifies cached count and cold errors never retain loading labels",async()=>{
  state.onRequest=async()=>viewerList();const h=await mount("viewers",{id:"resource"});assert.ok(find(h,"EmptyState"));
  state.onRequest=async()=>{throw new ApiError("refresh failed",503);};await press(h,"새로고침");
  assert.match(renderedText(h),/이전 조회 결과 · 확인 직원 0명/);assert.equal(nodes(h.tree).some(row=>row.type==="EmptyState"),false);assert.equal(spinnerCount(h),0);
  for(const status of [403,503]){
    state.onRequest=async()=>{throw new ApiError("cold failed",status);};const cold=await mount("viewers",{id:"resource"});
    assert.match(renderedText(cold),/열람 현황 확인 불가/);assert.doesNotMatch(renderedText(cold),/불러오는 중|확인 직원 0명/);assert.equal(spinnerCount(cold),0);
  }
});
test("viewers503 preserves prior rows with previous-result label and403 masks them",async()=>{
  state.onRequest=async()=>viewerList([{user:{id:"actor",name:"PRIVATE_VIEWER",departmentName:"지원",positionName:"담당"},firstViewedAt:iso,lastViewedAt:iso,visitCount:1}]);
  const h=await mount("viewers",{id:"resource"});
  state.onRequest=async()=>{throw new ApiError("refresh failed",503);};await press(h,"새로고침");
  assert.match(renderedText(h),/이전 조회 결과 · 확인 직원 1명/);assert.match(renderedText(h),/PRIVATE_VIEWER/);assert.equal(spinnerCount(h),0);
  state.onRequest=async()=>{throw new ApiError("revoked",403);};await press(h,"새로고침");assert.doesNotMatch(renderedText(h),/PRIVATE_VIEWER/);assert.equal(spinnerCount(h),0);
});
test("detail completed read failure has no perpetual spinner and cached body is marked previous content",async()=>{
  const h=await mount("detail",{id:"resource"});state.onRequest=async()=>{throw new ApiError("refresh failed",503);};await press(h,"자료 새로고침");
  assert.match(renderedText(h),/이전 조회 내용을 표시/);assert.match(renderedText(h),/PRIVATE_ORIGINAL_CONTENT/);assert.equal(spinnerCount(h),0);
  for(const status of [403,503]){
    state.onRequest=async()=>{throw new ApiError("cold failed",status);};const cold=await mount("detail",{id:"resource"});
    assert.match(renderedText(cold),/자료 내용을 확인하지 못했습니다/);assert.equal(spinnerCount(cold),0);assert.doesNotMatch(renderedText(cold),/PRIVATE_ORIGINAL_CONTENT/);
  }
});
test("attachment cold403/503 finishes without a perpetual spinner or private file/preview",async()=>{
  for(const status of [403,503]){
    state.onRequest=async()=>{throw new ApiError("cold failed",status);};const h=await mount("file",{id:"file"});
    assert.equal(spinnerCount(h),0);assert.match(renderedText(h),/첨부를 확인하지 못했습니다/);
    assert.equal(nodes(h.tree).some(row=>row.type==="PdfPreview"||row.type==="Image"),false);
  }
});
test("confirmed resource deletion keeps success without an old visit error suggesting failed detail loading",async()=>{
  state.onRequest=async(path:string)=>path.endsWith("/views")?Promise.reject(new ApiError("visit uncertain",0)):{resource:state.resource};
  const h=await mount("detail",{id:"resource"});state.onRequest=async()=>mutation("delete");await press(h,"자료 삭제");
  assert.equal(find(h,"AccountFeedback").error,null);assert.equal(find(h,"AccountFeedback").message,"저장 확정");
  assert.doesNotMatch(renderedText(h),/자료 내용을 확인하지 못했습니다|PRIVATE_ORIGINAL_CONTENT/);assert.equal(spinnerCount(h),0);
});
