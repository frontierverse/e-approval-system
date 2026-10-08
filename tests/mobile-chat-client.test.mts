import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after,beforeEach,test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api";
import * as core from "../mobile/src/lib/chat";
// Runs actual production component logic with lexical boundaries. No physical keyboard/OS/FlatList viewability claim.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
const key="__chatClientProductionBoundary";const state:Row={};let active:Hooks;function activate(scope:Hooks){active=scope;}
const same=(a:unknown[]|undefined,b:unknown[])=>!!a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
class Hooks {slots:Row[]=[];index=0;effects:Row[]=[];tree:Row={};prevent:Row={};props:Row;guard=()=>state.account;constructor(public kind:string,props:Row={}){this.props=props;} render(){activate(this);this.index=0;this.tree=components[this.kind]({...this.props,isCurrentAccount:this.guard});return this.tree;}flush(){for(const effect of this.effects.splice(0)){effect.cell.cleanup?.();effect.cell.cleanup=effect.cell.fn();}}blur(){for(const cell of this.slots)if(cell.focus)cell.cleanup?.();}refocus(){for(const cell of this.slots)if(cell.focus)cell.cleanup=cell.fn();}replay(){for(const cell of this.slots)if(cell.effect){cell.cleanup?.();cell.cleanup=cell.fn();}}unmount(){for(const cell of this.slots)cell.cleanup?.();}}
const cell=()=>{const i=active.index++;return active.slots[i]??(active.slots[i]={});};
const effect=(fn:()=>unknown,deps:unknown[])=>{const c=cell();c.effect=true;if(!same(c.deps,deps)){c.deps=deps;c.fn=fn;active.effects.push({cell:c});}};
const message=(sequence="9007199254740993",patch:Row={})=>({id:`msg-${sequence}`,sequence,senderId:"peer",recipientId:"own",body:"받은 내용",createdAt:"2026-10-03T00:00:00.000Z",readAt:null,...patch});
const employee={id:"peer",name:"직원",departmentName:"지원",positionName:"담당",active:true};
const summary=()=>({employees:[employee],conversations:[{peer:employee,lastMessage:message(),unreadCount:1}],unreadCount:1});
const request=async(path:string,options:Row={})=>{state.requests.push({path,...options});return state.onRequest(path,options);};
const defaultChat:Row={refreshSummary:async()=>{state.refreshes++;return state.onSummaryRefresh?state.onSummaryRefresh():state.summary;},authenticatedRequest:request,isCurrentAccount:()=>state.account,foreground:true,foregroundEpoch:0,isForegroundCurrent:(epoch:number)=>state.account&&chat.foreground&&epoch===chat.foregroundEpoch,summary:null,error:null};
const chat:Row={...defaultChat};
function setChatForeground(value:boolean) { if(chat.foreground!==value) chat.foregroundEpoch++; chat.foreground=value; }
const expireSession=async()=>state.expired++;
const harness:Row={...core,ApiError,
Stack:{Screen:"Stack.Screen"},StyleSheet:{create:(value:unknown)=>value,absoluteFill:{position:"absolute",top:0,right:0,bottom:0,left:0}},useWindowDimensions:()=>state.dimensions,useHomeTheme:()=>harness.useTheme(),SafeAreaView:"SafeAreaView",ChatListAction:"ChatListAction",ChatListTabs:"ChatListTabs",ChatListSearch:"ChatListSearch",ChatListRow:"ChatListRow",ChatListLoading:"ChatListLoading",ChatListNotice:"ChatListNotice",ChatListEmpty:"ChatListEmpty",ChatFilePreviewHeader:"ChatFilePreviewHeader",ChatFilePreviewInfo:"ChatFilePreviewInfo",ChatFilePreviewLoading:"ChatFilePreviewLoading",ChatFilePreviewFeedback:"ChatFilePreviewFeedback",ChatFilePreviewWebPdf:"ChatFilePreviewWebPdf",
React:{createElement:(type:unknown,props:Row|null,...children:unknown[])=>({type,props:{...props,children}}),Fragment:"Fragment"},
useRef:(v:unknown)=>{const c=cell();return c.ref??(c.ref={current:v});},useState:(v:unknown)=>{const c=cell();if(!c.state){c.state={value:typeof v==="function"?v():v};c.setter=(next:unknown)=>{c.state.value=typeof next==="function"?next(c.state.value):next;};}return[c.state.value,c.setter];},useCallback:(fn:unknown,deps:unknown[])=>{const c=cell();if(!same(c.deps,deps)){c.deps=deps;c.fn=fn;}return c.fn;},useEffect:effect,useLayoutEffect:effect,useFocusEffect:(fn:()=>unknown)=>{const i=active.index;effect(fn,[fn]);active.slots[i].focus=true;},
usePreventRemove:(enabled:boolean,callback:unknown)=>{active.prevent={enabled,callback};},useNavigation:()=>({dispatch:(action:unknown)=>state.dispatched.push(action)}),useSafeAreaInsets:()=>({bottom:16}),
useConfirmAction:(options:Row={})=>{state.confirmOptions.push(options);return {inline:false,dialog:null,ask:async(options:Row)=>{state.confirmations.push(options);return state.confirm;}};},useTheme:()=>({text:"text",secondary:"secondary",muted:"muted",accent:"accent",surface:"surface",background:"background",border:"border",danger:"danger",accentSoft:"accentSoft"}),
useChat:()=>chat,useSession:()=>({token:"token-a",user:{id:"own"},expireSession}),
Keyboard:{dismiss:()=>state.keyboardDismisses++},BackHandler:{addEventListener:(_name:string,fn:unknown)=>{state.backHandlers.push(fn);return{remove:()=>{state.backHandlers=state.backHandlers.filter((handler:unknown)=>handler!==fn);}};}},Platform:{OS:"android"},AppState:{currentState:"active",addEventListener:(event:string,fn:unknown)=>{state.listeners[event]=fn;return{remove:()=>delete state.listeners[event]};}},setInterval:(fn:unknown)=>{state.timers.push(fn);return state.timers.length;},clearInterval:()=>{},
FlatList:"FlatList",KeyboardAvoidingView:"KeyboardAvoidingView",KeyboardScreen:"KeyboardScreen",KeyboardScrollView:"ScrollView",KeyboardFlatList:"FlatList",ActivityIndicator:"ActivityIndicator",Text:"Text",View:"View",Modal:"Modal",ScrollView:"ScrollView",Image:"Image",ChatInput:"ChatInput",ChatThreadMessage:"ChatThreadMessage",ChatThreadLoading:"ChatThreadLoading",ChatThreadSelectedFile:"ChatThreadSelectedFile",ChatThreadFileSummary:"ChatThreadFileSummary",ChatBadge:"ChatBadge",ChatRowLink:"ChatRowLink",AccountFeedback:"AccountFeedback",PrimaryButton:"PrimaryButton",TextAction:"TextAction",EmptyState:"EmptyState",ChatAttachmentActions:"ChatAttachmentActions",PdfPreview:"PdfPreview",
discardChatFile:(file:Row,options:Row)=>{state.discards.push({file,token:options.token,current:options.isCurrent()});},clearChatFileResources:async()=>{state.purges++;},router:{push:(value:unknown)=>state.routes.push(value),canGoBack:()=>false,back:()=>state.routes.push("BACK"),replace:(value:unknown)=>state.routes.push(value)},pickChatFile:async()=>state.onPick?state.onPick():state.selectedFile??null,uploadChatFile:async(options:Row)=>state.onUpload(options),createChatFileTransfer:()=>{state.operations++;return state.transfer;},chatFileSize:(size:number)=>`${size}B`,registerChatPreviewAttachment:()=>{},loadChatPreview:async(options:Row)=>{state.previewRequests.push(options);return state.onPreview(options);},lookupChatPreviewAttachment:()=>state.previewAttachment,
apiRequest:request,createContext:()=>({Provider:"Provider"}),useContext:()=>null,
};
(globalThis as Row)[key]=harness;
async function load(file:string,name:string){const source=readFileSync(new URL(`../mobile/src/${file}`,import.meta.url),"utf8");const injected=source.replace(/^import[\s\S]*?;\n/gm,"");const out=ts.transpileModule(`const {${Object.keys(harness).filter(k=>!new RegExp(`(?:function|class|const|let)\\s+${k}\\b`).test(injected)).join(",")}}=globalThis.${key};\n${injected}\nexport {${name}};`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;return(await import(`data:text/javascript;base64,${Buffer.from(out).toString("base64")}`))[name];}
const components:Row={thread:await load("components/chat-thread-screen.tsx","ChatThreadContent"),list:await load("components/chat-screen.tsx","ChatScreenContent"),file:await load("components/chat-attachment-actions.tsx","ChatAttachmentActions"),provider:await load("lib/chat-provider.tsx","AccountChatProvider"),preview:await load("components/chat-file-preview-screen.tsx","ChatFilePreviewContent")};
const scopes:Hooks[]=[];const tick=()=>new Promise<void>(r=>setImmediate(r));const update=(h:Hooks)=>{h.render();h.flush();};
async function mount(kind:string,props:Row={}){const h=new Hooks(kind,{peerId:"peer",...props});scopes.push(h);h.render();h.flush();await tick();update(h);return h;}
function nodes(root:unknown):Row[]{if(Array.isArray(root))return root.flatMap(nodes);if(!root||typeof root!=="object")return[];const row=root as Row;return[row,...Object.values(row.props??{}).flatMap(nodes)];}
function find(h:Hooks,type:string,label?:string){const n=nodes(h.tree).find(n=>n.type===type&&(!label||n.props.title===label||n.props.label===label));assert.ok(n,`${type} ${label??""}`);return n.props;}
function deferred(){let resolve!:(v:unknown)=>void;let reject!:(v:unknown)=>void;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
beforeEach(()=>{for(const scope of scopes.splice(0))scope.unmount();Object.assign(state,{dimensions:{width:390,height:844,fontScale:1,scale:1},account:true,closed:undefined,keyboardDismisses:0,confirmOptions:[],backHandlers:[],onSummaryRefresh:null,requests:[],refreshes:0,summary:summary(),onRequest:async(path:string,options:Row)=>path==="/chat"?state.summary:path.startsWith("/chat/messages?")?{messages:[message()],hasMore:false}:path==="/chat/read"?{ok:true}:options.method==="POST"?{message:message("9007199254740994",{senderId:"own",recipientId:"peer",body:options.body.body})}:null,confirm:true,confirmations:[],dispatched:[],routes:[],expired:0,timers:[],listeners:{},operations:0,purges:0,discards:[],downloads:0,saves:0,completes:0,statuses:0,ready:false,transferPending:false});Object.assign(chat,defaultChat);state.transfer={download:async()=>{state.downloads++;state.ready=true;return true;},save:async()=>{state.saves++;return{kind:"handoff",requiresConfirmation:true,message:"외부 저장 화면"};},share:async()=>({kind:"handoff",requiresConfirmation:true,message:"공유 화면"}),isReady:()=>state.ready,getState:()=>({ready:state.ready,exported:false,requiresConfirmation:false,completionPending:state.transferPending,completed:false}),status:async()=>{state.statuses++;return{match:true,status:"deleting"};},complete:async()=>{state.completes++;state.transferPending=true;const result=await state.onComplete();state.transferPending=false;return result;},cancel:()=>{},release:()=>{}};state.onComplete=async()=>({message:message()});state.previewAttachment={id:"file",originalName:"민감 기록.pdf",size:12,status:"available"};state.previewRequests=[];state.previewReleases=0;state.onPreview=async()=>({uri:"private-preview",mimeType:"application/pdf",kind:"pdf",release:()=>state.previewReleases++});state.selectedFile=null;state.onPick=null;state.onUpload=async()=>{throw new Error("not used");};});
after(()=>{for(const scope of scopes)scope.unmount();delete(globalThis as Row)[key];});
test("loaded messages alone never mark read; only visible inbound ID does",async()=>{const h=await mount("thread");assert.equal(state.requests.filter((r:Row)=>r.path==="/chat/read").length,0);const list=find(h,"FlatList");list.onViewableItemsChanged({viewableItems:[{isViewable:true,item:message("1",{senderId:"own",recipientId:"peer"})}]});await tick();assert.equal(state.requests.filter((r:Row)=>r.path==="/chat/read").length,0);list.onViewableItemsChanged({viewableItems:[{isViewable:true,item:message()}]});await tick();assert.deepEqual(state.requests.find((r:Row)=>r.path==="/chat/read").body,{peerId:"peer",messageId:message().id});});
test("read callbacks after blur/background/account switch cannot mutate",async()=>{const h=await mount("thread");const callback=find(h,"FlatList").onViewableItemsChanged;h.blur();callback({viewableItems:[{isViewable:true,item:message()}]});setChatForeground(false);update(h);state.account=false;callback({viewableItems:[{isViewable:true,item:message()}]});await tick();assert.equal(state.requests.filter((r:Row)=>r.path==="/chat/read").length,0);});
test("unknown201 send preserves key and original body; captured duplicate send blocked",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("원래 입력");update(h);const send=find(h,"PrimaryButton","보내기").onPress;const pending=deferred();state.onRequest=async(path:string)=>path==="/chat/messages"?pending.promise:{messages:[message()],hasMore:false};send();send();assert.equal(state.requests.filter((r:Row)=>r.path==="/chat/messages").length,1);pending.reject(new ApiError("JSON 유실",201));await tick();update(h);find(h,"ChatInput").onChange("변경 시도");update(h);assert.equal(find(h,"ChatInput").value,"원래 입력");state.onRequest=async(_path:string,options:Row)=>({message:message("9007199254740994",{senderId:"own",recipientId:"peer",body:options.body.body})});find(h,"PrimaryButton","같은 전송 다시 확인").onPress();await tick();update(h);const sends=state.requests.filter((r:Row)=>r.path==="/chat/messages");assert.deepEqual(sends[0].body,sends[1].body);assert.equal(find(h,"ChatInput").value,"");});
test("freshfocus failure masks whole content and retains local input until confirmed loss",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("보관 입력");update(h);h.blur();state.onRequest=async()=>{throw new ApiError("권한 확인 장애",503);};h.refocus();await tick();update(h);assert.equal(nodes(h.tree).some(n=>n.type==="FlatList"),false);assert.equal(nodes(h.tree).some(n=>n.type==="ChatInput"),false);state.onRequest=async(path:string)=>path.startsWith("/chat/messages?")?{messages:[message()],hasMore:false}:null;find(h,"TextAction","새로고침").onPress();await tick();update(h);assert.equal(find(h,"ChatInput").value,"보관 입력");h.blur();state.onRequest=async()=>{throw new ApiError("더 이상 접근 불가",404);};h.refocus();await tick();update(h);assert.equal(nodes(h.tree).some(n=>n.type==="ChatInput"),false);});
test("late send acknowledgement after blur never clears retained attempt",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("대기 입력");update(h);const pending=deferred();state.onRequest=async(path:string)=>path==="/chat/messages"?pending.promise:{messages:[message()],hasMore:false};find(h,"PrimaryButton","보내기").onPress();h.blur();pending.resolve({message:message("9007199254740994",{senderId:"own",recipientId:"peer",body:"대기 입력"})});await tick();h.refocus();await tick();update(h);assert.equal(find(h,"ChatInput").value,"대기 입력");assert.ok(find(h,"PrimaryButton","같은 전송 다시 확인"));});
test("dirty navigation cancel keeps input and accepted action is scope guarded",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("입력");update(h);assert.equal(h.prevent.enabled,true);state.confirm=false;h.prevent.callback({data:{action:"BACK"}});await tick();assert.equal(state.dispatched.length,0);assert.equal(find(h,"ChatInput").value,"입력");state.confirm=true;h.prevent.callback({data:{action:"BACK"}});state.account=false;await tick();assert.equal(state.dispatched.length,0);});
test("file handoff/cancel never completes until explicit saved confirmation",async()=>{const h=await mount("file",{attachment:{id:"file",originalName:"기록.pdf",size:12,status:"available"},peerId:"peer",messageId:"message",isSender:false,isCurrent:()=>state.account,enabled:true,onPending:()=>{},onClose:()=>{},onChanged:()=>{}});find(h,"PrimaryButton","파일 저장").onPress();await tick();update(h);assert.equal(state.downloads,1);assert.equal(state.completes,0);state.confirm=false;find(h,"PrimaryButton","파일을 저장했습니다 · 수신 완료").onPress();await tick();update(h);assert.equal(state.completes,0);state.confirm=true;find(h,"PrimaryButton","파일을 저장했습니다 · 수신 완료").onPress();await tick();update(h);assert.equal(state.completes,1);});
test("unknowncomplete retries same operation/token; never redownloads",async()=>{const h=await mount("file",{attachment:{id:"file",originalName:"기록.pdf",size:12,status:"available"},peerId:"peer",messageId:"message",isSender:false,isCurrent:()=>state.account,enabled:true,onPending:()=>{},onClose:()=>{},onChanged:()=>{}});find(h,"PrimaryButton","파일 저장").onPress();await tick();update(h);state.onComplete=async()=>{throw new ApiError("응답 유실",0);};find(h,"PrimaryButton","파일을 저장했습니다 · 수신 완료").onPress();await tick();update(h);assert.ok(find(h,"PrimaryButton","원래 수신 완료 상태 확인"));state.onComplete=async()=>({message:message()});state.previewAttachment={id:"file",originalName:"민감 기록.pdf",size:12,status:"available"};state.previewRequests=[];state.previewReleases=0;state.onPreview=async()=>({uri:"private-preview",mimeType:"application/pdf",kind:"pdf",release:()=>state.previewReleases++});state.selectedFile=null;state.onPick=null;state.onUpload=async()=>{throw new Error("not used");};find(h,"PrimaryButton","원래 수신 완료 상태 확인").onPress();await tick();update(h);assert.equal(state.operations,1);assert.equal(state.downloads,1);assert.equal(state.statuses,1);assert.equal(state.completes,2);});
test("list navigation captured before new account is ignored",async()=>{const h=await mount("list");const list=find(h,"FlatList");const row=list.renderItem({item:{peer:employee,conversation:state.summary.conversations[0]}});const navigate=row.props.onPress;state.account=false;navigate();assert.equal(state.routes.length,0);});
test("provider failed refresh invalidates unread badge instead of false zero",async()=>{state.summary={employees:[employee],conversations:[],unreadCount:0};const h=await mount("provider",{token:"token-a",userId:"own",isAccount:()=>state.account,expireSession:async()=>state.expired++});assert.equal(h.tree.props.value.unreadCount,0);state.onRequest=async()=>{throw new ApiError("장애",503);};await h.tree.props.value.refreshSummary();update(h);assert.equal(h.tree.props.value.unreadCount,null);assert.ok(h.tree.props.value.summary);});
test("provider StrictMode generation discards pre-cleanup private response",async()=>{const pending=deferred();const next=deferred();let count=0;state.onRequest=async()=>++count===1?pending.promise:next.promise;const h=await mount("provider",{token:"token-a",userId:"own",isAccount:()=>state.account,expireSession:async()=>state.expired++});h.replay();pending.resolve(state.summary);await tick();update(h);assert.equal(h.tree.props.value.summary,null);assert.equal(h.tree.props.value.unreadCount,null);});
test("wrong successful body never clears immutable composer or claims send success",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("원래 내용");update(h);state.onRequest=async()=>({message:message("9007199254740994",{senderId:"own",recipientId:"peer",body:"다른 내용"})});find(h,"PrimaryButton","보내기").onPress();await tick();update(h);assert.equal(find(h,"ChatInput").value,"원래 내용");assert.ok(find(h,"PrimaryButton","같은 전송 다시 확인"));});
test("unknown receipt cannot close or discard original operation",async()=>{let closed=0;const h=await mount("file",{attachment:{id:"file",originalName:"기록.pdf",size:12,status:"available"},peerId:"peer",messageId:"message",isSender:false,isCurrent:()=>state.account,enabled:true,onPending:()=>{},onClose:()=>closed++,onChanged:()=>{}});find(h,"PrimaryButton","파일 저장").onPress();await tick();update(h);state.onComplete=async()=>{throw new ApiError("응답 유실",0);};find(h,"PrimaryButton","파일을 저장했습니다 · 수신 완료").onPress();await tick();update(h);find(h,"TextAction","닫기").onPress();await tick();update(h);assert.equal(closed,0);assert.ok(find(h,"PrimaryButton","원래 수신 완료 상태 확인"));});
test("OS handoff temporarily hidden by AppState keeps external-save confirmation",async()=>{const handoff=deferred();state.transfer.save=async()=>handoff.promise;const h=await mount("file",{attachment:{id:"file",originalName:"기록.pdf",size:12,status:"available"},peerId:"peer",messageId:"message",isSender:false,isCurrent:()=>state.account,enabled:true,onPending:()=>{},onClose:()=>{},onChanged:()=>{}});find(h,"PrimaryButton","파일 저장").onPress();await tick();h.props.enabled=false;update(h);assert.equal(h.tree,null);handoff.resolve({kind:"handoff",requiresConfirmation:true,message:"공유 완료"});await tick();h.props.enabled=true;update(h);assert.ok(find(h,"PrimaryButton","파일을 저장했습니다 · 수신 완료"));assert.equal(state.completes,0);});
test("inactive peer after lost response still permits only original immutable replay",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("원래 전송");update(h);state.onRequest=async()=>{throw new ApiError("응답 손실",0);};find(h,"PrimaryButton","보내기").onPress();await tick();update(h);h.blur();state.summary={employees:[],conversations:[{peer:{...employee,active:false},lastMessage:message(),unreadCount:1}],unreadCount:1};state.onRequest=async(path:string,options:Row)=>path.startsWith("/chat/messages?")?{messages:[message()],hasMore:false}:{message:message("9007199254740994",{senderId:"own",recipientId:"peer",body:options.body.body})};h.refocus();await tick();update(h);assert.ok(find(h,"PrimaryButton","같은 전송 다시 확인"));find(h,"PrimaryButton","같은 전송 다시 확인").onPress();await tick();update(h);const sends=state.requests.filter((r:Row)=>r.path==="/chat/messages");assert.equal(sends.length,2);assert.deepEqual(sends[0].body,sends[1].body);assert.equal(nodes(h.tree).some(n=>n.type==="ChatInput"),false);});
test("reopened receipt restores pending same-key state without downloading",async()=>{state.transfer.getState=()=>({ready:false,exported:true,requiresConfirmation:false,completionPending:true,completed:false});const h=await mount("file",{attachment:{id:"file",originalName:"기록.pdf",size:12,status:"available"},peerId:"peer",messageId:"message",isSender:false,isCurrent:()=>state.account,enabled:true,onPending:()=>{},onClose:()=>{},onChanged:()=>{}});assert.ok(find(h,"PrimaryButton","원래 수신 완료 상태 확인"));assert.equal(nodes(h.tree).some(n=>n.type==="PrimaryButton"&&n.props.title==="파일 저장"),false);find(h,"PrimaryButton","원래 수신 완료 상태 확인").onPress();await tick();update(h);assert.equal(state.operations,1);assert.equal(state.downloads,0);assert.equal(state.statuses,1);assert.equal(state.completes,1);});
test("preview closes action panel before Stack push and uses only public IDs",async()=>{let closed=0;const h=await mount("file",{attachment:{id:"file",originalName:"private-person.pdf",size:12,status:"available"},peerId:"peer",messageId:"message",isSender:false,isCurrent:()=>state.account,enabled:true,onPending:()=>{},onClose:()=>closed++,onChanged:()=>{}});find(h,"TextAction","미리보기").onPress();assert.equal(closed,1);assert.deepEqual(state.routes,[{pathname:"/chat/file-preview",params:{attachmentId:"file",peerId:"peer"}}]);assert.equal(state.downloads,0);assert.equal(state.completes,0);});
test("provider background pauses polling and active resume refreshes once",async()=>{const h=await mount("provider",{token:"token-a",userId:"own",isAccount:()=>state.account,expireSession:async()=>state.expired++});const before=state.requests.length;state.listeners.change("background");state.timers.at(-1)();await tick();assert.equal(state.requests.length,before);state.listeners.change("active");state.timers.at(-1)();await tick();update(h);assert.equal(state.requests.length,before+1);});
test("late401 from old account never expires replacement session",async()=>{const pending=deferred();state.onRequest=async()=>pending.promise;await mount("provider",{token:"token-a",userId:"own",isAccount:()=>state.account,expireSession:async()=>state.expired++});state.account=false;pending.reject(new ApiError("옛 계정 만료",401));await tick();assert.equal(state.expired,0);});
test("returning foreground masks data before fresh permission response",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("보관");update(h);setChatForeground(false);update(h);assert.equal(nodes(h.tree).some(n=>n.type==="FlatList"),false);const pending=deferred();state.onRequest=async()=>pending.promise;setChatForeground(true);update(h);assert.equal(nodes(h.tree).some(n=>n.type==="FlatList"),false);pending.resolve({messages:[message()],hasMore:false});await tick();update(h);assert.equal(find(h,"ChatInput").value,"보관");});
test("preflight stale-key conflict has no completionPOST and permits explicit close",async()=>{let closed=0;const h=await mount("file",{attachment:{id:"file",originalName:"기록.pdf",size:12,status:"available"},peerId:"peer",messageId:"message",isSender:false,isCurrent:()=>state.account,enabled:true,onPending:()=>{},onClose:()=>closed++,onChanged:()=>{}});find(h,"PrimaryButton","파일 저장").onPress();await tick();update(h);state.transfer.complete=async()=>{throw new ApiError("수신 키 변경",409);};find(h,"PrimaryButton","파일을 저장했습니다 · 수신 완료").onPress();await tick();update(h);assert.equal(state.completes,0);assert.equal(nodes(h.tree).some(n=>n.type==="PrimaryButton"&&n.props.title==="원래 수신 완료 상태 확인"),false);find(h,"TextAction","닫기").onPress();await tick();assert.equal(closed,1);});
test("confirmed thread permission loss removes hidden file panel and releases navigation lock",async()=>{const attachment={id:"file",originalName:"기록.pdf",size:12,status:"available"};state.onRequest=async()=>({messages:[message("9007199254740993",{attachment})],hasMore:false});const h=await mount("thread");const list=find(h,"FlatList");const row=list.renderItem({item:message("9007199254740993",{attachment})});const action=nodes(row).find(n=>n.type==="TextAction"&&n.props.label==="기록.pdf");assert.ok(action);action.props.onPress();update(h);find(h,"ChatAttachmentActions").onPending(true);update(h);assert.equal(h.prevent.enabled,true);state.onRequest=async()=>{throw new ApiError("권한 상실",404);};find(h,"TextAction","새로고침").onPress();await tick();update(h);assert.equal(nodes(h.tree).some(n=>n.type==="ChatAttachmentActions"),false);assert.equal(h.prevent.enabled,false);assert.equal(state.purges,1);});
test("file-only successful fallback body clears composer and releases opaque selection",async()=>{let released=0;state.selectedFile={name:"기록.pdf",size:12,release:()=>released++};state.onRequest=async(path:string)=>path==="/chat/files"?{maxFileSize:4194304,zipMaxFileSize:104857600,uploadChunkSize:4194304,maxFileCount:1,allowedExtensions:[".pdf",".zip"]}:{messages:[message()],hasMore:false};state.onUpload=async(options:Row)=>({message:message("9007199254740994",{senderId:"own",recipientId:"peer",body:`파일: ${options.file.name}`,attachment:{id:"file",originalName:options.file.name,size:options.file.size,status:"available"}})});const h=await mount("thread");find(h,"TextAction","파일 선택").onPress();await tick();update(h);assert.equal(find(h,"ChatInput").value,"");find(h,"PrimaryButton","보내기").onPress();await tick();update(h);assert.equal(released,1);assert.ok(find(h,"PrimaryButton","보내기"));assert.equal(nodes(h.tree).some(n=>n.type==="PrimaryButton"&&n.props.title==="같은 전송 다시 확인"),false);assert.equal(find(h,"AccountFeedback").message,"메시지를 전송했습니다.");});
test("explicit discard cancel preserves unknown upload; confirm abandons only local original snapshot",async()=>{state.selectedFile={name:"기록.pdf",size:12,release:()=>{}};state.onRequest=async(path:string)=>path==="/chat/files"?{maxFileSize:4194304,zipMaxFileSize:104857600,uploadChunkSize:4194304,maxFileCount:1,allowedExtensions:[".pdf"]}:{messages:[message()],hasMore:false};state.onUpload=async()=>{throw new ApiError("전송 결과 유실",0);};const h=await mount("thread");find(h,"TextAction","파일 선택").onPress();await tick();update(h);find(h,"PrimaryButton","보내기").onPress();await tick();update(h);const requests=state.requests.length;state.confirm=false;find(h,"TextAction","작성 내용 버리기").onPress();await tick();update(h);assert.equal(state.discards.length,0);assert.ok(find(h,"PrimaryButton","같은 전송 다시 확인"));state.confirm=true;find(h,"TextAction","작성 내용 버리기").onPress();await tick();update(h);assert.equal(state.discards.length,1);assert.equal(state.discards[0].file,state.selectedFile);assert.equal(state.discards[0].token,"token-a");assert.equal(state.discards[0].current,true);assert.equal(state.requests.length,requests);assert.equal(find(h,"PrimaryButton","보내기").disabled,true);});
test("confirmed removal marks abandon only for actual unmount; ordinary blur keeps snapshot",async()=>{state.selectedFile={name:"기록.pdf",size:12,release:()=>{}};state.onRequest=async(path:string)=>path==="/chat/files"?{maxFileSize:4194304,zipMaxFileSize:104857600,uploadChunkSize:4194304,maxFileCount:1,allowedExtensions:[".pdf"]}:{messages:[message()],hasMore:false};const h=await mount("thread");find(h,"TextAction","파일 선택").onPress();await tick();update(h);h.blur();assert.equal(state.discards.length,0);h.refocus();await tick();update(h);h.prevent.callback({data:{action:"BACK"}});await tick();assert.deepEqual(state.dispatched,["BACK"]);assert.equal(state.discards.length,0);h.unmount();assert.equal(state.discards.length,1);assert.equal(state.discards[0].current,true);});
test("leave confirmation cannot abandon a send that starts before confirmation resolves",async()=>{const h=await mount("thread");find(h,"ChatInput").onChange("보낼 내용");update(h);const sending=deferred();state.onRequest=async()=>sending.promise;h.prevent.callback({data:{action:"BACK"}});find(h,"PrimaryButton","보내기").onPress();await tick();assert.equal(state.dispatched.length,0);assert.equal(state.discards.length,0);sending.reject(new ApiError("전송 미확인",0));await tick();});
test("initial bottom positioning survives an estimated undershoot and uses each measured height", async () => {
  const h = await mount("thread");
  const list = find(h, "FlatList");
  const offsets: Row[] = [];
  list.ref.current = { scrollToOffset: (value: Row) => offsets.push(value) };
  list.onContentSizeChange(390, 3000);
  list.onScroll({ nativeEvent: { contentOffset: { y: 2424 }, layoutMeasurement: { height: 576 }, contentSize: { height: 3988 } } });
  list.onContentSizeChange(390, 3988);
  assert.deepEqual(offsets, [{ offset: 3000, animated: false }, { offset: 3988, animated: false }, { offset: 3988, animated: false }]);
  list.onScroll({ nativeEvent: { contentOffset: { y: 3412 }, layoutMeasurement: { height: 576 }, contentSize: { height: 3988 } } });
  list.onScroll({ nativeEvent: { contentOffset: { y: 2400 }, layoutMeasurement: { height: 576 }, contentSize: { height: 3988 } } });
  list.onContentSizeChange(390, 4100);
  assert.equal(offsets.length, 3, "actual bottom ends initial intent; later history viewing remains in place");
});
test("composer and keyboard viewport changes keep the measured latest message above the input", async () => {
  const h = await mount("thread");
  const list = find(h, "FlatList");
  const offsets: Row[] = [];
  list.ref.current = { scrollToOffset: (value: Row) => offsets.push(value) };
  list.onContentSizeChange(390, 3988);
  list.onScroll({ nativeEvent: { contentOffset: { y: 3412 }, layoutMeasurement: { height: 576 }, contentSize: { height: 3988 } } });
  // Composer measurement arrives after the initial content has already reached its end.
  list.onLayout({ nativeEvent: { layout: { height: 500 } } });
  assert.equal(offsets.at(-1)?.offset, 3988);
  assert.equal(offsets.length, 2, "viewport-only changes need another measured scroll request");
  list.onScroll({ nativeEvent: { contentOffset: { y: 3488 }, layoutMeasurement: { height: 500 }, contentSize: { height: 3988 } } });
  // Native scroll metrics may precede the layout callback during keyboard animation.
  list.onScroll({ nativeEvent: { contentOffset: { y: 3488 }, layoutMeasurement: { height: 260 }, contentSize: { height: 3988 } } });
  list.onLayout({ nativeEvent: { layout: { height: 260 } } });
  assert.equal(offsets.length, 4);
  assert.ok(offsets.every(value => value.offset === 3988 && value.animated === false));
  list.onScrollBeginDrag();
  list.onLayout({ nativeEvent: { layout: { height: 576 } } });
  list.onContentSizeChange(390, 4100);
  assert.equal(offsets.length, 4, "intentional history reading cancels resize following");
});
test("a partially hidden latest row does not finish initial positioning", async () => {
  const h = await mount("thread");
  const list = find(h, "FlatList");
  const offsets: Row[] = [];
  list.ref.current = { scrollToOffset: (value: Row) => offsets.push(value) };
  list.onContentSizeChange(390, 3988);
  list.onScroll({ nativeEvent: { contentOffset: { y: 3392 }, layoutMeasurement: { height: 576 }, contentSize: { height: 3988 } } });
  list.onScroll({ nativeEvent: { contentOffset: { y: 3392 }, layoutMeasurement: { height: 500 }, contentSize: { height: 3988 } } });
  list.onLayout({ nativeEvent: { layout: { height: 500 } } });
  assert.equal(offsets.at(-1)?.offset, 3988);
  assert.equal(offsets.length, 3);
});
test("freshly verified reentry starts at latest after history viewing", async () => {
  const h = await mount("thread");
  const list = find(h, "FlatList");
  const offsets: Row[] = [];
  list.ref.current = { scrollToOffset: (value: Row) => offsets.push(value) };
  list.onScrollBeginDrag();
  find(h, "TextAction", "새로고침").onPress();
  await tick(); update(h);
  find(h, "FlatList").onContentSizeChange(390, 3988);
  assert.deepEqual(offsets, [{ offset: 3988, animated: false }]);
});
test("explicit user scroll and older-message prepend stop automatic bottom positioning", async () => {
  state.onRequest = async () => ({ messages: [message()], hasMore: true });
  const h = await mount("thread");
  const list = find(h, "FlatList");
  let offsets = 0;
  list.ref.current = { scrollToOffset: () => offsets++ };
  list.onScrollBeginDrag();
  list.onContentSizeChange(390, 3988);
  assert.equal(offsets, 0);
  h.blur(); h.refocus(); await tick(); update(h);
  const restored = find(h, "FlatList");
  restored.onTouchMove();
  restored.onContentSizeChange(390, 3988);
  assert.equal(offsets, 0);
  h.blur(); h.refocus(); await tick(); update(h);
  const prepend = find(h, "FlatList");
  prepend.ListHeaderComponent.props.onPress();
  await tick(); update(h);
  find(h, "FlatList").onContentSizeChange(390, 8000);
  assert.equal(offsets, 0, "prepending history must not jump to latest messages");
});
test("captured scroll callbacks cannot move a blurred or replaced account list", async () => {
  const h = await mount("thread");
  const list = find(h, "FlatList");
  let offsets = 0;
  list.ref.current = { scrollToOffset: () => offsets++ };
  h.blur();
  list.onContentSizeChange(390, 3988);
  list.onLayout({ nativeEvent: { layout: { height: 500 } } });
  assert.equal(offsets, 0);
  h.refocus(); await tick(); update(h);
  state.account = false;
  find(h, "FlatList").onContentSizeChange(390, 3988);
  find(h, "FlatList").onLayout({ nativeEvent: { layout: { height: 500 } } });
  assert.equal(offsets, 0);
});
test("web wheel cancels initial positioning without treating programmatic scroll as user intent", async () => {
  const previous = harness.Platform.OS;
  harness.Platform.OS = "web";
  try {
    const h = await mount("thread");
    const list = find(h, "FlatList");
    let offsets = 0;
    list.ref.current = { scrollToOffset: () => offsets++ };
    list.onWheel();
    list.onContentSizeChange(390, 3988);
    assert.equal(offsets, 0);
  } finally { harness.Platform.OS = previous; }
});
test("confirmed own send requests the latest position even after viewing older messages", async () => {
  const h = await mount("thread");
  const list = find(h, "FlatList");
  const offsets: Row[] = [];
  let endRequests = 0;
  list.ref.current = { scrollToOffset: (value: Row) => offsets.push(value), scrollToEnd: () => endRequests++ };
  list.onScrollBeginDrag();
  find(h, "ChatInput").onChange("새 메시지"); update(h);
  find(h, "PrimaryButton", "보내기").onPress();
  await tick(); update(h);
  assert.equal(endRequests, 1);
  list.onScroll({ nativeEvent: { contentOffset: { y: 2424 }, layoutMeasurement: { height: 576 }, contentSize: { height: 4100 } } });
  find(h, "FlatList").onContentSizeChange(390, 4100);
  assert.deepEqual(offsets, [{ offset: 4100, animated: false }]);
});


test("preview foreground loss immediately masks private name and PDF and releases only preview", async () => {
  const h = await mount("preview", { attachmentId: "file" });
  assert.equal(find(h, "PdfPreview").uri, "private-preview");
  const requests = state.previewRequests.length;
  setChatForeground(false);
  h.render();
  assert.equal(nodes(h.tree).some(n => n.type === "PdfPreview" || n.type === "Image"), false);
  assert.equal(JSON.stringify(h.tree).includes("민감 기록.pdf"), false);
  h.flush();
  assert.equal(state.previewReleases, 1);
  assert.equal(state.previewRequests[0].signal.aborted, true);
  assert.equal(state.previewRequests.length, requests);
  assert.equal(state.purges, 0);
  assert.equal(state.previewAttachment.id, "file");
});

test("preview aborts pending background GET and releases its late private URL without disclosure", async () => {
  const pending = deferred();
  state.onPreview = async () => pending.promise;
  const h = await mount("preview", { attachmentId: "file" });
  setChatForeground(false);
  update(h);
  assert.equal(state.previewRequests[0].signal.aborted, true);
  assert.equal(state.previewRequests[0].isCurrent(), false);
  pending.resolve({ uri: "late-private-image", mimeType: "image/png", kind: "image", release: () => state.previewReleases++ });
  await tick();
  update(h);
  assert.equal(state.previewReleases, 1);
  assert.equal(JSON.stringify(h.tree).includes("late-private-image"), false);
  assert.equal(state.completes, 0);
});

test("preview resume waits for fresh authorized bytes before revealing private image", async () => {
  state.onPreview = async () => ({ uri: "old-private-image", mimeType: "image/png", kind: "image", release: () => state.previewReleases++ });
  const h = await mount("preview", { attachmentId: "file" });
  assert.equal(find(h, "Image").source.uri, "old-private-image");
  setChatForeground(false);
  update(h);
  const pending = deferred();
  state.onPreview = async () => pending.promise;
  setChatForeground(true);
  update(h);
  assert.equal(state.previewRequests.length, 2);
  assert.equal(nodes(h.tree).some(n => n.type === "Image" || n.type === "PdfPreview"), false);
  pending.resolve({ uri: "fresh-private-image", mimeType: "image/png", kind: "image", release: () => state.previewReleases++ });
  await tick();
  update(h);
  assert.equal(find(h, "Image").source.uri, "fresh-private-image");
  assert.equal(state.purges, 0);
});

test("preview resume permission failure exposes no cached name and offers only return to conversation", async () => {
  const h = await mount("preview", { attachmentId: "file" });
  setChatForeground(false);
  update(h);
  state.onPreview = async () => { throw new ApiError("미리보기 권한이 없습니다.", 403); };
  setChatForeground(true);
  update(h);
  await tick();
  update(h);
  assert.equal(nodes(h.tree).some(n => n.type === "PdfPreview" || n.type === "Image"), false);
  assert.equal(JSON.stringify(h.tree).includes("민감 기록.pdf"), false);
  assert.equal(find(h, "ChatFilePreviewFeedback").failure, "forbidden");
  assert.equal(nodes(h.tree).some(n => n.type === "TextAction" && n.props.label === "미리보기 다시 확인"), false);
  assert.ok(find(h, "TextAction", "대화로 돌아가기"));
});

test("captured preview retry stays blocked in background and cannot complete or download files", async () => {
  state.onPreview = async () => { throw new ApiError("연결을 확인하세요.", 0); };
  const h = await mount("preview", { attachmentId: "file" });
  const retry = find(h, "TextAction", "미리보기 다시 확인").onPress;
  const count = state.previewRequests.length;
  setChatForeground(false);
  update(h);
  retry();
  await tick();
  assert.equal(state.previewRequests.length, count);
  assert.equal(state.completes + state.downloads + state.saves, 0);
});

test("preview late old-account result is released and never expires replacement session", async () => {
  const pending = deferred();
  state.onPreview = async () => pending.promise;
  const h = await mount("preview", { attachmentId: "file" });
  state.account = false;
  update(h);
  pending.resolve({ uri: "old-account-private", mimeType: "application/pdf", kind: "pdf", release: () => state.previewReleases++ });
  await tick();
  update(h);
  assert.equal(state.previewReleases, 1);
  assert.equal(JSON.stringify(h.tree).includes("old-account-private"), false);
  assert.equal(state.expired, 0);
});


test("captured old image error cannot release a newer foreground preview", async () => {
  state.onPreview = async () => ({ uri: "old-private-image", mimeType: "image/png", kind: "image", release: () => state.previewReleases++ });
  const h = await mount("preview", { attachmentId: "file" });
  const oldError = find(h, "Image").onError;
  setChatForeground(false);
  update(h);
  oldError();
  assert.equal(state.previewReleases, 1);
  state.onPreview = async () => ({ uri: "fresh-private-image", mimeType: "image/png", kind: "image", release: () => state.previewReleases++ });
  setChatForeground(true);
  update(h);
  await tick();
  update(h);
  oldError();
  update(h);
  assert.equal(find(h, "Image").source.uri, "fresh-private-image");
  assert.equal(state.previewReleases, 1);
  assert.equal(nodes(h.tree).some(n => n.type === "ChatFilePreviewFeedback"), false);
});

test("preview blur removes earlier failure and blocks captured navigation until fresh focus", async () => {
  state.onPreview = async () => { throw new ApiError("이전 조회 안내", 0); };
  const h = await mount("preview", { attachmentId: "file" });
  const retry = find(h, "TextAction", "미리보기 다시 확인").onPress;
  const back = find(h, "ChatFilePreviewHeader").onBack;
  h.blur(); update(h);
  assert.equal(JSON.stringify(h.tree).includes("이전 조회 안내"), false);
  const count = state.previewRequests.length;
  retry(); back(); await tick();
  assert.equal(state.previewRequests.length, count);
  assert.deepEqual(state.routes, []);
  const fresh = deferred(); state.onPreview = async () => fresh.promise;
  h.refocus(); update(h);
  assert.equal(nodes(h.tree).some(n => n.type === "ChatFilePreviewFeedback"), false);
  fresh.resolve({ uri: "fresh-after-blur", mimeType: "application/pdf", kind: "pdf", release: () => state.previewReleases++ });
  await tick(); update(h);
  assert.equal(find(h, "PdfPreview").uri, "fresh-after-blur");
});

test("preview repeated retry issues one GET and removes all private metadata until authorization", async () => {
  state.onPreview = async () => { throw new ApiError("일시적인 조회 실패", 0); };
  const h = await mount("preview", { attachmentId: "file" });
  const retry = find(h, "TextAction", "미리보기 다시 확인").onPress;
  const pending = deferred(); state.onPreview = async () => pending.promise;
  retry(); retry(); update(h);
  assert.equal(state.previewRequests.length, 2);
  assert.equal(JSON.stringify(h.tree).includes("민감 기록.pdf"), false);
  assert.equal(JSON.stringify(h.tree).includes("일시적인 조회 실패"), false);
  pending.resolve({ uri: "retry-private", mimeType: "image/png", kind: "image", release: () => state.previewReleases++ });
  await tick(); update(h);
  assert.equal(find(h, "Image").resizeMode, "contain");
  assert.equal(find(h, "ChatFilePreviewInfo").mimeType, "image/png");
  assert.equal(state.completes + state.downloads + state.saves, 0);
});

test("preview direct entry never fetches an unregistered file and invalid peer returns to list once", async () => {
  state.previewAttachment = null;
  const h = await mount("preview", { attachmentId: "file", peerId: "invalid/peer" });
  assert.equal(state.previewRequests.length, 0);
  assert.equal(find(h, "ChatFilePreviewFeedback").failure, "selection");
  const back = find(h, "ChatFilePreviewHeader").onBack;
  back(); back(); update(h);
  assert.deepEqual(state.routes, ["/chat"]);
  assert.equal(nodes(h.tree).some(n => n.type === "ChatFilePreviewFeedback"), false);
});

test("preview back releases authorized content and falls back to the existing peer route", async () => {
  const h = await mount("preview", { attachmentId: "file" });
  find(h, "ChatFilePreviewHeader").onBack(); update(h);
  assert.deepEqual(state.routes, [{ pathname: "/chat/[peerId]", params: { peerId: "peer" } }]);
  assert.equal(state.previewReleases, 1);
  assert.equal(state.previewRequests[0].signal.aborted, true);
  assert.equal(JSON.stringify(h.tree).includes("민감 기록.pdf"), false);
});

test("preview web PDF preserves the truthful installed-app notice and never fabricates document pages", async () => {
  const previous = harness.Platform.OS; harness.Platform.OS = "web";
  try {
    const h = await mount("preview", { attachmentId: "file" });
    assert.ok(find(h, "ChatFilePreviewWebPdf"));
    assert.equal(nodes(h.tree).some(n => n.type === "PdfPreview"), false);
    assert.equal(find(h, "ChatFilePreviewInfo").file, state.previewAttachment);
  } finally { harness.Platform.OS = previous; }
});


// These connect the actual provider to the actual screens. AppState callbacks run
// synchronously, while both transitions deliberately precede the next React commit.
const integrateProvider = (provider: Hooks) => {
  update(provider);
  Object.assign(chat, provider.tree.props.value);
};
const providerProps = () => ({ token: "token-a", userId: "own", isAccount: () => state.account, expireSession });

test("batched Android blur/focus rejects held summary and messages until new permission GETs", async () => {
  const oldSummary = deferred(), oldPage = deferred(), freshSummary = deferred(), freshPage = deferred();
  let summaries = 0, pages = 0;
  state.onRequest = async (path: string) => path === "/chat" ? (++summaries === 1 ? oldSummary.promise : freshSummary.promise)
    : path.startsWith("/chat/messages?") ? (++pages === 1 ? oldPage.promise : freshPage.promise) : { ok: true };
  const provider = await mount("provider", providerProps());
  integrateProvider(provider);
  const thread = await mount("thread");
  assert.equal(summaries, 1);
  assert.equal(pages, 1);
  state.listeners.blur(); state.listeners.focus();
  integrateProvider(provider); update(thread);
  assert.equal(chat.foregroundEpoch, 2);
  assert.equal(summaries, 2);
  assert.equal(pages, 2);
  oldSummary.resolve(summary());
  oldPage.resolve({ messages: [message("9007199254740993", { body: "obsolete private body" })], hasMore: false });
  await tick(); integrateProvider(provider); update(thread);
  assert.equal(nodes(thread.tree).some(n => n.type === "FlatList"), false);
  assert.equal(JSON.stringify(thread.tree).includes("obsolete private body"), false);
  assert.equal(provider.tree.props.value.summary, null);
  assert.equal(provider.tree.props.value.unreadCount, null);
  assert.equal(state.requests.filter((r: Row) => r.path === "/chat/read").length, 0);
  freshSummary.resolve(summary());
  freshPage.resolve({ messages: [message("9007199254740994", { body: "fresh permission body" })], hasMore: false });
  await tick(); integrateProvider(provider); update(thread);
  const list = find(thread, "FlatList");
  assert.equal(list.data[0].body, "fresh permission body");
  list.onViewableItemsChanged({ viewableItems: [{ isViewable: true, item: list.data[0] }] });
  await tick();
  assert.equal(state.requests.filter((r: Row) => r.path === "/chat/read").length, 1);
  assert.equal(state.expired, 0);
});

test("raw blur synchronously blocks captured read, send, picker and navigation before render", async () => {
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const thread = await mount("thread");
  find(thread, "ChatInput").onChange("preserved composer"); update(thread);
  const read = find(thread, "FlatList").onViewableItemsChanged;
  const send = find(thread, "PrimaryButton", "보내기").onPress;
  const pick = find(thread, "TextAction", "파일 선택").onPress;
  const change = find(thread, "ChatInput").onChange;
  const list = await mount("list");
  const row = find(list, "FlatList").renderItem({ item: { peer: employee, conversation: state.summary.conversations[0] } });
  const before = state.requests.length;
  state.listeners.blur();
  read({ viewableItems: [{ isViewable: true, item: message() }] }); send(); pick(); change("stale change"); row.props.onPress();
  await tick();
  assert.equal(state.requests.length, before);
  assert.equal(state.routes.length, 0);
  assert.equal(state.expired, 0);
  state.listeners.focus(); integrateProvider(provider); update(thread); update(list);
  await tick(); integrateProvider(provider); update(thread); update(list);
  assert.equal(find(thread, "ChatInput").value, "preserved composer");
  read({ viewableItems: [{ isViewable: true, item: message() }] });
  assert.equal(state.requests.filter((r: Row) => r.path === "/chat/read").length, 0, "old FlatList callback stays rejected after fresh resume");
});

test("pre-resume send ACK preserves original input and immutable retry without expiring account", async () => {
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const thread = await mount("thread");
  find(thread, "ChatInput").onChange("original immutable text"); update(thread);
  const held = deferred();
  const readHandler = state.onRequest;
  state.onRequest = async (path: string, options: Row) => path === "/chat/messages" ? held.promise : readHandler(path, options);
  find(thread, "PrimaryButton", "보내기").onPress();
  const original = state.requests.find((r: Row) => r.path === "/chat/messages").body;
  state.listeners.blur(); state.listeners.focus(); integrateProvider(provider); update(thread);
  held.resolve({ message: message("9007199254740994", { senderId: "own", recipientId: "peer", body: original.body }) });
  await tick(); integrateProvider(provider); update(thread);
  assert.equal(find(thread, "ChatInput").value, "original immutable text");
  assert.ok(find(thread, "PrimaryButton", "같은 전송 다시 확인"));
  assert.equal(state.expired, 0);
  state.onRequest = async (path: string, options: Row) => path === "/chat/messages"
    ? { message: message("9007199254740994", { senderId: "own", recipientId: "peer", body: options.body.body }) } : readHandler(path, options);
  find(thread, "PrimaryButton", "같은 전송 다시 확인").onPress(); await tick(); update(thread);
  const sends = state.requests.filter((r: Row) => r.path === "/chat/messages");
  assert.deepEqual(sends[1].body, original);
  assert.equal(find(thread, "ChatInput").value, "");
});

test("batched foreground transition releases held preview and requires a new preview fetch", async () => {
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const old = deferred(), fresh = deferred(); let requests = 0;
  state.onPreview = async () => ++requests === 1 ? old.promise : fresh.promise;
  const preview = await mount("preview", { attachmentId: "file" });
  state.listeners.blur(); state.listeners.focus(); integrateProvider(provider); update(preview);
  assert.equal(requests, 2);
  old.resolve({ uri: "obsolete-private-uri", mimeType: "application/pdf", kind: "pdf", release: () => state.previewReleases++ });
  await tick(); update(preview);
  assert.equal(JSON.stringify(preview.tree).includes("obsolete-private-uri"), false);
  assert.equal(state.previewReleases, 1);
  fresh.resolve({ uri: "fresh-private-uri", mimeType: "application/pdf", kind: "pdf", release: () => state.previewReleases++ });
  await tick(); update(preview);
  assert.equal(find(preview, "PdfPreview").uri, "fresh-private-uri");
  assert.equal(state.expired, 0);
});

test("OS picker result stays private until resumed thread permissions are verified", async () => {
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  state.onRequest = async (path: string) => path === "/chat/files"
    ? { maxFileSize: 4194304, zipMaxFileSize: 104857600, uploadChunkSize: 4194304, maxFileCount: 1, allowedExtensions: [".pdf"] }
    : path === "/chat" ? state.summary : { messages: [message()], hasMore: false };
  const thread = await mount("thread");
  const picker = deferred(); state.onPick = () => picker.promise;
  find(thread, "TextAction", "파일 선택").onPress(); await tick();
  state.listeners.blur(); integrateProvider(provider); update(thread);
  const selected = { name: "selected-private.pdf", size: 12, release: () => {} };
  picker.resolve(selected); await tick(); update(thread);
  assert.equal(JSON.stringify(thread.tree).includes(selected.name), false);
  const page = deferred(); const readHandler = state.onRequest;
  state.onRequest = async (path: string) => path.startsWith("/chat/messages?") ? page.promise : readHandler(path);
  state.listeners.focus(); integrateProvider(provider); update(thread);
  assert.equal(JSON.stringify(thread.tree).includes(selected.name), false);
  page.resolve({ messages: [message()], hasMore: false }); await tick(); integrateProvider(provider); update(thread);
  assert.equal(JSON.stringify(thread.tree).includes(selected.name), true);
  assert.equal(state.discards.length, 0);
});

test("file panel blocks captured actions on blur while existing OS handoff retains confirmation", async () => {
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const props = { attachment: { id: "file", originalName: "file.pdf", size: 12, status: "available" }, peerId: "peer", messageId: "message", isSender: false, isCurrent: () => state.account, enabled: true, onPending: () => {}, onClose: () => {}, onChanged: () => {} };
  const file = await mount("file", props);
  const preview = find(file, "TextAction", "미리보기").onPress;
  const save = find(file, "PrimaryButton", "파일 저장").onPress;
  state.listeners.blur(); preview(); save(); await tick();
  assert.equal(state.routes.length, 0); assert.equal(state.downloads, 0);
  state.listeners.focus(); integrateProvider(provider); update(file);
  const handoff = deferred(); state.transfer.save = () => handoff.promise;
  find(file, "PrimaryButton", "파일 저장").onPress(); await tick();
  state.listeners.blur(); integrateProvider(provider); update(file);
  handoff.resolve({ kind: "handoff", requiresConfirmation: true, message: "OS sheet returned" }); await tick();
  assert.equal(file.tree, null);
  state.listeners.focus(); integrateProvider(provider); update(file);
  assert.ok(find(file, "PrimaryButton", "파일을 저장했습니다 · 수신 완료"));
  assert.equal(state.completes, 0);
  assert.equal(state.downloads, 1);
});

test("held upload is invalidated synchronously but its original attempt remains available after fresh resume", async () => {
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const readHandler = state.onRequest;
  state.onRequest = async (path: string, options: Row) => path === "/chat/files"
    ? { maxFileSize: 4194304, zipMaxFileSize: 104857600, uploadChunkSize: 4194304, maxFileCount: 1, allowedExtensions: [".pdf"] }
    : readHandler(path, options);
  let released = 0;
  state.selectedFile = { name: "original.pdf", size: 12, release: () => released++ };
  const held = deferred(); const uploads: Row[] = [];
  state.onUpload = (options: Row) => { uploads.push(options); return held.promise; };
  const thread = await mount("thread");
  find(thread, "ChatInput").onChange("file text"); update(thread);
  find(thread, "TextAction", "파일 선택").onPress(); await tick(); update(thread);
  find(thread, "PrimaryButton", "보내기").onPress();
  assert.equal(uploads[0].isCurrent(), true);
  state.listeners.blur();
  assert.equal(uploads[0].isCurrent(), false, "guard rejects old bytes before React commit");
  state.listeners.focus(); integrateProvider(provider); update(thread);
  held.resolve({ message: message("9007199254740994", { senderId: "own", recipientId: "peer", body: "file text" }) });
  await tick(); integrateProvider(provider); update(thread);
  assert.equal(released, 0);
  assert.equal(find(thread, "ChatInput").value, "file text");
  assert.ok(find(thread, "PrimaryButton", "같은 전송 다시 확인"));
  state.onUpload = async (options: Row) => { uploads.push(options); return { message: message("9007199254740994", { senderId: "own", recipientId: "peer", body: options.body }) }; };
  find(thread, "PrimaryButton", "같은 전송 다시 확인").onPress(); await tick(); update(thread);
  assert.equal(uploads[1].requestId, uploads[0].requestId);
  assert.equal(uploads[1].file, uploads[0].file);
  assert.equal(uploads[1].body, uploads[0].body);
  assert.equal(released, 1);
  assert.equal(state.discards.length, 0);
  assert.equal(state.expired, 0);
});

test("late foreground-era401 cannot expire a still-current account or replace fresh summary", async () => {
  const held = deferred(); let reads = 0;
  state.onRequest = async () => ++reads === 1 ? held.promise : summary();
  const provider = await mount("provider", providerProps());
  state.listeners.blur(); state.listeners.focus();
  held.reject(new ApiError("obsolete response", 401));
  await tick(); update(provider);
  assert.equal(provider.tree.props.value.foregroundEpoch, 2);
  assert.equal(provider.tree.props.value.summary.unreadCount, 1);
  assert.equal(provider.tree.props.value.error, null);
  assert.equal(state.expired, 0);
});


test("OS picker keeps its own lock across resume and late denied selection is released", async () => {
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const readHandler = state.onRequest;
  state.onRequest = async (path: string, options: Row) => path === "/chat/files"
    ? { maxFileSize: 4194304, zipMaxFileSize: 104857600, uploadChunkSize: 4194304, maxFileCount: 1, allowedExtensions: [".pdf"] }
    : readHandler(path, options);
  const thread = await mount("thread");
  find(thread, "ChatInput").onChange("keep while picker open"); update(thread);
  let picks = 0, released = 0; const picker = deferred();
  state.onPick = () => { picks++; return picker.promise; };
  find(thread, "TextAction", "파일 선택").onPress(); await tick(); update(thread);
  const originalSend = find(thread, "PrimaryButton", "파일 선택 중").onPress;
  state.listeners.blur(); state.listeners.focus(); integrateProvider(provider); update(thread);
  await tick(); integrateProvider(provider); update(thread);
  const resumedSend = find(thread, "PrimaryButton", "파일 선택 중").onPress;
  const resumedPick = find(thread, "TextAction", "파일 선택").onPress;
  originalSend(); resumedSend(); resumedPick(); await tick();
  assert.equal(picks, 1);
  assert.equal(state.requests.filter((r: Row) => r.path === "/chat/messages").length, 0);
  state.onRequest = async () => { throw new ApiError("fresh permission denied", 404); };
  find(thread, "TextAction", "새로고침").onPress(); await tick(); update(thread);
  picker.resolve({ name: "must-not-retain.pdf", size: 12, release: () => released++ });
  await tick(); update(thread);
  assert.equal(released, 1);
  assert.equal(JSON.stringify(thread.tree).includes("must-not-retain.pdf"), false);
  assert.equal(state.routes.length, 0);
  assert.equal(state.expired, 0);
});


test("chat list search stays visible and preserves name/department/position query across both modes",async()=>{
 const h=await mount("list");
 find(h,"ChatListSearch").onChange("지원");update(h);
 assert.equal(find(h,"FlatList").data.length,1);
 find(h,"ChatListTabs").onChange(true);update(h);
 assert.equal(find(h,"ChatListSearch").value,"지원");
 find(h,"ChatListTabs").onChange(false);update(h);
 assert.equal(find(h,"ChatListSearch").value,"지원");
 find(h,"ChatListSearch").onClear();update(h);
 assert.equal(find(h,"ChatListSearch").value,"");
 find(h,"ChatListSearch").onChange("담당");update(h);assert.equal(find(h,"FlatList").data.length,1);
 find(h,"ChatListSearch").onChange("받은 내용");update(h);assert.equal(find(h,"FlatList").data.length,0,"message body is not searchable");
 assert.equal(state.requests.length,0,"list/search never calls read or send");
});
test("new chat selects employee finder and clears only the local query",async()=>{
 const h=await mount("list");find(h,"ChatListSearch").onChange("없음");update(h);
 find(h,"ChatListAction","새 대화").onPress();update(h);
 assert.equal(find(h,"ChatListTabs").directory,true);assert.equal(find(h,"ChatListSearch").value,"");
 assert.equal(find(h,"FlatList").data.length,1);assert.equal(state.requests.length,0);
});
test("manual chat refresh masks private rows, locks inputs, deduplicates captured actions and preserves query",async()=>{
 const h=await mount("list");find(h,"ChatListSearch").onChange("지원");update(h);
 const search=find(h,"ChatListSearch"),tabs=find(h,"ChatListTabs"),fresh=find(h,"ChatListAction","새로고침").onPress,newChat=find(h,"ChatListAction","새 대화").onPress;
 const held=deferred();state.onSummaryRefresh=()=>held.promise;update(h);
 const refresh=find(h,"ChatListAction","새로고침").onPress;const before=state.refreshes;refresh();refresh();update(h);
 assert.equal(state.refreshes,before+1);assert.equal(find(h,"FlatList").data.length,0);
 assert.equal(find(h,"ChatListSearch").disabled,true);assert.equal(find(h,"ChatListTabs").disabled,true);assert.equal(find(h,"ChatListAction","새 대화").disabled,true);
 search.onChange("지우기 시도");search.onClear();tabs.onChange(true);newChat();fresh();update(h);
 assert.equal(find(h,"ChatListSearch").value,"지원");assert.equal(find(h,"ChatListTabs").directory,false);
 held.resolve(state.summary);await tick();update(h);assert.equal(find(h,"FlatList").data.length,1);assert.equal(find(h,"ChatListSearch").disabled,false);
});
test("first/fresh chat lookup failure differs from empty records and keeps previous private rows hidden",async()=>{
 const h=await mount("list");state.onSummaryRefresh=async()=>null;update(h);find(h,"ChatListAction","새로고침").onPress();await tick();update(h);
 assert.equal(find(h,"FlatList").data.length,0);assert.ok(find(h,"ChatListNotice").error);
 assert.equal(nodes(h.tree).some(n=>n.type==="ChatListEmpty"),false);
 assert.equal(find(h,"ChatListSearch").disabled,true);
});
test("periodic failure retains only verified current-account list and reports unread unknown",async()=>{
 const h=await mount("list");chat.summary=state.summary;chat.error="네트워크 확인 필요";update(h);
 assert.equal(find(h,"FlatList").data.length,1);assert.equal(find(h,"ChatListNotice").periodic,true);
 assert.ok(JSON.stringify(h.tree).includes("확인 필요"));
 chat.summary=null;update(h);assert.equal(find(h,"FlatList").data.length,0);assert.equal(find(h,"ChatListSearch").disabled,true);
});
test("captured chat search, clear, new and tabs cannot act after account change or raw foreground invalidation",async()=>{
 const h=await mount("list");const search=find(h,"ChatListSearch"),tabs=find(h,"ChatListTabs"),fresh=find(h,"ChatListAction","새 대화");
 state.account=false;search.onChange("이전 직원");tabs.onChange(true);fresh.onPress();search.onClear();update(h);
 assert.equal(find(h,"ChatListSearch").value,"");assert.equal(find(h,"ChatListTabs").directory,false);assert.equal(state.routes.length,0);
});
test("employee no-record state has precedence over unmatched search; list preserves supplied order",async()=>{
 const second={...employee,id:"peer-2",name:"둘째",active:false};state.summary={employees:[],conversations:[{peer:second,lastMessage:message(),unreadCount:0},{peer:employee,lastMessage:message(),unreadCount:1}],unreadCount:1};
 const h=await mount("list");assert.deepEqual(find(h,"FlatList").data.map((r:Row)=>r.peer.id),["peer-2","peer"]);
 find(h,"ChatListSearch").onChange("없는 직원");find(h,"ChatListTabs").onChange(true);update(h);
 assert.equal(find(h,"ChatListEmpty").noRecords,true);assert.equal(find(h,"ChatListEmpty").directory,true);
});

test("background and fresh permission check remove stale private feedback from the rendered tree", async () => {
  const h = await mount("thread");
  find(h, "ChatInput").onChange("보관 입력"); update(h);
  state.onRequest = async () => { throw new ApiError("민감한_기록.pdf 전송 실패", 400); };
  find(h, "PrimaryButton", "보내기").onPress(); await tick(); update(h);
  assert.ok(JSON.stringify(h.tree).includes("민감한_기록.pdf"));
  setChatForeground(false); update(h);
  assert.equal(JSON.stringify(h.tree).includes("민감한_기록.pdf"), false);
  assert.equal(nodes(h.tree).some(n => n.type === "AccountFeedback"), false);
  const fresh = deferred(); state.onRequest = async () => fresh.promise;
  setChatForeground(true); update(h);
  assert.equal(JSON.stringify(h.tree).includes("민감한_기록.pdf"), false);
  fresh.resolve({ messages: [message()], hasMore: false }); await tick(); update(h);
  assert.equal(find(h, "ChatInput").value, "보관 입력");
});

test("jump to new messages clears old visible IDs before allowing a new read acknowledgement", async () => {
  const h = await mount("thread");
  const original = find(h, "FlatList");
  original.onScrollBeginDrag();
  original.onViewableItemsChanged({ viewableItems: [{ item: message(), isViewable: true }] });
  state.onRequest = async path => path.startsWith("/chat/messages?") ? { messages: [message(), message("9007199254740994")], hasMore: false } : { ok: true };
  state.timers.at(-1)(); await tick(); update(h);
  const jump = find(h, "TextAction", "새 메시지 1개 · 최신 메시지로");
  const readBefore = state.requests.filter((r: Row) => r.path === "/chat/read").length;
  jump.onPress(); update(h);
  find(h, "FlatList").onScroll({ nativeEvent: { contentOffset: { y: 100 }, layoutMeasurement: { height: 500 }, contentSize: { height: 600 } } });
  await tick();
  assert.equal(state.requests.filter((r: Row) => r.path === "/chat/read").length, readBefore, "jump must not mark formerly visible history as read");
  find(h, "FlatList").onViewableItemsChanged({ viewableItems: [{ item: message("9007199254740994"), isViewable: true }] });
  await tick();
  assert.equal(state.requests.filter((r: Row) => r.path === "/chat/read").at(-1)?.body.messageId, "msg-9007199254740994");
});

test("compact uncertain thread pins original retry and discard outside composer scrolling", async () => {
  state.dimensions = { width: 180, height: 380, fontScale: 1, scale: 1 };
  const h = await mount("thread");
  find(h, "ChatInput").onChange("고정한 원래 전송"); update(h);
  state.onRequest = async () => { throw new ApiError("응답 확인 필요", 503); };
  find(h, "PrimaryButton", "보내기").onPress(); await tick(); update(h);
  const scroll = find(h, "ScrollView");
  assert.equal(nodes(scroll.children).some(n => n.type === "PrimaryButton" && n.props.title === "같은 전송 다시 확인"), false);
  assert.equal(nodes(scroll.children).some(n => n.type === "TextAction" && n.props.label === "작성 내용 버리기"), false);
  assert.ok(find(h, "TextAction", "작성 내용 버리기"));
  assert.equal(find(h, "ChatInput").disabled, true);
  state.onRequest = async (_path: string, options: Row) => ({ message: message("9007199254740994", { senderId: "own", recipientId: "peer", body: options.body.body }) });
  find(h, "PrimaryButton", "같은 전송 다시 확인").onPress(); await tick(); update(h);
  const sends = state.requests.filter((r: Row) => r.path === "/chat/messages");
  assert.deepEqual(sends[0].body, sends[1].body);
  assert.equal(find(h, "ChatInput").value, "");
});


test("opening Android file actions stays in the app window without triggering the privacy reload loop", async () => {
  const attachment = { id: "file", originalName: "synthetic.pdf", size: 12, status: "available" };
  state.onRequest = async (path: string) => path === "/chat" ? state.summary
    : { messages: [message("9007199254740993", { attachment })], hasMore: false };
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const thread = await mount("thread");
  const row = find(thread, "FlatList").renderItem({ item: message("9007199254740993", { attachment }) });
  nodes(row).find(n => n.type === "TextAction")!.props.onPress(); update(thread);
  const file = await mount("file", find(thread, "ChatAttachmentActions"));
  const requests = state.requests.length;
  // Android native Modal steals Activity focus; dismissal returns it. Exercise
  // that real event boundary against the provider and thread, rather than
  // exempting an internal window from privacy checks.
  for (let frame = 0; frame < 6; frame++) {
    if (nodes(file.tree).some(n => n.type === "Modal")) {
      state.listeners.blur(); integrateProvider(provider); update(thread);
      file.props = find(thread, "ChatAttachmentActions"); update(file);
      state.listeners.focus(); await tick(); integrateProvider(provider); update(thread);
      await tick(); update(thread);
      file.props = find(thread, "ChatAttachmentActions"); update(file);
    } else {
      integrateProvider(provider); update(thread); update(file);
    }
  }
  assert.equal(chat.foregroundEpoch, 0, "opening our own file UI never invalidates the foreground");
  assert.equal(state.keyboardDismisses, 1);
  assert.equal(state.requests.length, requests, "no repeated access checks or file downloads");
  assert.equal(nodes(file.tree).some(n => n.type === "Modal"), false);
  assert.equal(find(file, "View").testID, "chat-file-actions-overlay");
  assert.ok(find(thread, "FlatList"));
  assert.equal(state.downloads, 0); assert.equal(state.completes, 0);
  assert.equal(state.confirmOptions.at(-1).inlineNative, true, "receipt confirmations cannot recreate an Android window");
  state.backHandlers.at(-1)(); await tick(); update(thread);
  assert.equal(nodes(thread.tree).some(n => n.type === "ChatAttachmentActions"), false);
});

test("native file overlay still masks real Android focus loss and waits for fresh thread permission", async () => {
  const attachment = { id: "file", originalName: "private-synthetic.pdf", size: 12, status: "available" };
  state.onRequest = async (path: string) => path === "/chat" ? state.summary
    : { messages: [message("9007199254740993", { attachment })], hasMore: false };
  const provider = await mount("provider", providerProps()); integrateProvider(provider);
  const thread = await mount("thread");
  const row = find(thread, "FlatList").renderItem({ item: message("9007199254740993", { attachment }) });
  nodes(row).find(n => n.type === "TextAction")!.props.onPress(); update(thread);
  const file = await mount("file", find(thread, "ChatAttachmentActions"));
  const save = find(file, "PrimaryButton", "파일 저장").onPress;
  state.listeners.blur(); save(); integrateProvider(provider); update(thread);
  file.props = find(thread, "ChatAttachmentActions"); update(file);
  assert.equal(file.tree, null); assert.equal(state.downloads, 0);
  assert.equal(nodes(thread.tree).some(n => n.type === "FlatList"), false);
  const fresh = deferred();
  state.onRequest = async (path: string) => path === "/chat" ? state.summary : fresh.promise;
  state.listeners.focus(); integrateProvider(provider); update(thread);
  file.props = find(thread, "ChatAttachmentActions"); update(file);
  assert.equal(file.tree, null, "focus alone cannot restore private file content");
  fresh.resolve({ messages: [message("9007199254740993", { attachment })], hasMore: false });
  await tick(); integrateProvider(provider); update(thread);
  file.props = find(thread, "ChatAttachmentActions"); update(file);
  assert.ok(find(file, "PrimaryButton", "파일 저장"));
  assert.equal(nodes(file.tree).some(n => n.type === "Modal"), false);
  assert.equal(chat.foregroundEpoch, 2);
});

test("web file actions retain the browser modal while native back cannot discard an uncertain receipt", async () => {
  const props = { attachment: { id: "file", originalName: "synthetic.pdf", size: 12, status: "available" }, peerId: "peer", messageId: "message", isSender: false, isCurrent: () => state.account, enabled: true, onPending: () => {}, onClose: () => { state.closed = true; }, onChanged: () => {} };
  state.transfer.getState = () => ({ ready: false, exported: true, completionPending: true });
  const file = await mount("file", props);
  assert.equal(state.backHandlers.at(-1)(), true); await tick(); update(file);
  assert.equal(state.closed, undefined);
  assert.ok(find(file, "PrimaryButton", "원래 수신 완료 상태 확인"));
  assert.match(find(file, "AccountFeedback").error, /원래 수신 완료 상태/);
  const previous = harness.Platform.OS; harness.Platform.OS = "web";
  try {
    const web = await mount("file", props);
    assert.ok(find(web, "Modal"));
  } finally { harness.Platform.OS = previous; }
});
