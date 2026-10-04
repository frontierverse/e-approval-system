import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, describe, test } from 'node:test';
import ts from 'typescript';
import { ApiError } from '../mobile/src/lib/api';
import * as youth from '../mobile/src/lib/youth';
import * as activities from '../mobile/src/lib/youth-activities';
import * as privacy from '../mobile/src/lib/youth-privacy';
import { youthAbort } from '../mobile/src/lib/youth-request';
// Actual TSX and hooks; native/router/network edges are lexical ports. No OS claim.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
const key='__youthActualClient11';const state:Row={},timers=new Map<number,()=>void>();let timerId=0,active:Hooks;
const same=(a:unknown[]|undefined,b:unknown[])=>!!a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
class Hooks{slots:Row[]=[];index=0;effects:Row[]=[];tree:Row={};prevent:Row={};constructor(public kind:string,public props:Row={}){}render(){
// The isolated hook harness models the currently rendering component instance.
// eslint-disable-next-line @typescript-eslint/no-this-alias
active=this;this.index=0;this.tree=components[this.kind](this.props);if(this.kind==='provider')state.actualProvider=this.tree.props.value;return this.tree;}flush(){for(const cell of this.effects.splice(0)){cell.cleanup?.();cell.cleanup=cell.fn();}}blur(){for(const cell of this.slots)if(cell.focus)cell.cleanup?.();}focus(){for(const cell of this.slots)if(cell.focus)cell.cleanup=cell.fn();}unmount(){for(const cell of this.slots)cell.cleanup?.();}}
const cell=()=>{const i=active.index++;return active.slots[i]??(active.slots[i]={});};
function effect(fn:()=>unknown,deps:unknown[]=[]){const c=cell();if(!same(c.deps,deps)){c.deps=deps;c.fn=fn;active.effects.push(c);}}
const request=async(path:string,options:Row={})=>{state.requests.push({path,...options});return state.onRequest(path,options);};
const provider={request,foreground:true,foregroundEpoch:0,isCurrentAccount:()=>state.account,isForeground:()=>state.account&&provider.foreground,isForegroundCurrent:(epoch:number)=>state.account&&provider.foreground&&epoch===provider.foregroundEpoch};
const appListeners=new Map<string,Set<(value?:string)=>void>>();
function appEvent(name:string,value?:string){if(name==='change')state.appState=value;for(const fn of appListeners.get(name)??[])fn(value);}
const h:Row={...youth,...activities,...privacy,ApiError,youthAbort,youthRequest:(path:string,_token:string,options:Row)=>request(path,options),createContext:()=>({Provider:'YouthContextProvider'}),useContext:()=>state.actualProvider,AppState:{get currentState(){return state.appState??'active';},addEventListener:(name:string,fn:(value?:string)=>void)=>{const bucket=appListeners.get(name)??new Set();bucket.add(fn);appListeners.set(name,bucket);return{remove:()=>bucket.delete(fn)};}},youthFileSize:(n:number)=>String(n),youthDisclosureCurrent:(deadline:number,now=state.monotonic)=>youth.youthDisclosureCurrent(deadline,now),performance:{now:()=>state.monotonic},setTimeout:(fn:()=>void)=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:(id:number)=>timers.delete(id),React:{createElement:(type:unknown,props:Row|null,...children:unknown[])=>typeof type==='function'&&[h.YouthMutationActions,h.YouthFilesEditor].includes(type)?type({...props,children}):({type,props:{...props,children}}),Fragment:'Fragment'},useRef:(value:unknown)=>{const c=cell();return c.ref??(c.ref={current:value});},useState:(value:unknown)=>{const c=cell();if(!c.state){c.state={value:typeof value==='function'?value():value};c.set=(v:unknown)=>{c.state.value=typeof v==='function'?v(c.state.value):v;};}return[c.state.value,c.set];},useCallback:(fn:unknown,deps:unknown[])=>{const c=cell();if(!same(c.deps,deps)){c.deps=deps;c.fn=fn;}return c.fn;},useEffect:effect,useLayoutEffect:effect,useFocusEffect:(fn:()=>unknown)=>{const i=active.index;effect(fn,[fn]);active.slots[i].focus=true;},usePreventRemove:(enabled:boolean,callback:unknown)=>{active.prevent={enabled,callback};},useNavigation:()=>({dispatch:(a:unknown)=>state.dispatched.push(a)}),useSafeAreaInsets:()=>({bottom:16}),useConfirmAction:()=>({dialog:null,ask:async(value:unknown)=>{state.confirmations.push(value);return state.confirm;}}),useYouth:()=>state.actualProvider??provider,useSession:()=>({token:'synthetic-youth-a',user:{id:'actor'},expireSession:async()=>state.expired++}),useTheme:()=>({}),StyleSheet:{create:(v:unknown)=>v},Platform:{OS:'android'},ActivityIndicator:'ActivityIndicator',ScrollView:'ScrollView',Text:'Text',View:'View',Pressable:'Pressable',TextInput:'TextInput',KeyboardAvoidingView:'KeyboardAvoidingView',KeyboardScreen:'KeyboardScreen',KeyboardScrollView:'ScrollView',KeyboardFlatList:'FlatList',YouthField:'YouthField',YouthRow:'YouthRow',PrimaryButton:'PrimaryButton',TextAction:'TextAction',AccountFeedback:'AccountFeedback',router:{push:(v:unknown)=>state.routes.push(v),setParams:(v:unknown)=>state.params.push(v)},useYouthUploads:()=>({files:state.uploadFiles??[],busy:false,error:null,busyRef:{current:false},readyIds:()=>state.uploadIds??[],count:()=>0,clear:()=>state.fileClears++,dialog:null}),YouthFilesEditor:()=>null};
(globalThis as Row)[key]=h;
async function load(file:string,name:string){const source=readFileSync(new URL(`../mobile/src/components/${file}`,import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'');const names=Object.keys(h).filter(k=>!new RegExp(`(?:function|class|const|let)\\s+${k}\\b`).test(source));const code=ts.transpileModule(`const {${names.join(',')}}=globalThis.${key};\n${source}\nexport {${name}};`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;return(await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))[name];}
h.useYouthSnapshot=await load('youth-ui.tsx','useYouthSnapshot');h.youthStyles={};h.s=h.youthStyles;h.useYouthMutation=await load('youth-mutation.tsx','useYouthMutation');h.useYouthLeave=await load('youth-write-ui.tsx','useYouthLeave');h.YouthMutationActions=await load('youth-write-ui.tsx','YouthMutationActions');
const components:Row={list:await load('youth-list-screen.tsx','YouthListContent'),detail:await load('youth-detail-screen.tsx','YouthDetailContent'),editor:await load('youth-editor.tsx','YouthEditorContent'),extension:await load('youth-extension-screen.tsx','Extension'),personal:await load('youth-personal-screen.tsx','Personal'),common:await load('youth-common-screen.tsx','Common'),learning:await load('youth-learning-screen.tsx','Learning'),rules:await load('youth-rules-screen.tsx','Rules'),documents:await load('youth-documents-screen.tsx','Documents')};
components.provider=await load('youth-provider.tsx','AccountYouth');
const iso='2026-10-04T00:00:00.000Z',newer='2026-10-04T00:00:00.001Z';const permissions={canViewYouthBasic:true,canViewYouthDetails:true,canViewYouthContacts:true,canDownloadYouthDocuments:true,canManageYouth:true,canDeleteYouth:false};
function basic(patch:Row={}){return{id:'youth-a',name:'합성 청소년',admissionDate:'2026-10-01',dischargeDate:'2026-11-01',updatedAt:iso,...patch};}
function detail(patch:Row={}){return{today:'2026-10-04',permissions:{...permissions},youth:basic(),...patch};}
function list(){return{today:'2026-10-04',permissions:{...permissions},items:[basic()],q:'',page:1,pageSize:20,total:1,totalPages:1};}
function view(kind:string,patch:Row={}){return{ok:true,replayed:false,today:'2026-10-04',permissions:{...permissions},youthId:'youth-a',sourceUpdatedAt:iso,auditedAt:iso,serverNow:iso,disclosureUntil:'2026-10-04T00:05:00.000Z',...(kind==='details'?{details:{birthDate:'2010-03-04',age:16,koreanAge:17,initialDischargeDate:'2026-11-01',dischargeExtensions:[]}}:{contacts:{phone:'010-1234-5678',familyContacts:[]}}),...patch};}
function receipt(options:Row,result:Row=detail()){const op=options.operation??'profile.create';return{ok:true,replayed:false,requestId:options.requestId,operation:op,targetType:op==='profile.create'?'Youth':'Youth',targetId:'youth-a',youthId:'youth-a',outcome:'present',committedAt:iso,committedUpdatedAt:newer,result};}
const scopes:Hooks[]=[];const tick=()=>new Promise<void>(r=>setImmediate(r));function update(scope:Hooks){scope.render();scope.flush();}
async function settle(scope:Hooks){for(let i=0;i<3;i++){await tick();update(scope);}}
async function mount(kind:string,props:Row={}){const scope=new Hooks(kind,props);scopes.push(scope);update(scope);await settle(scope);return scope;}
function nodes(v:unknown):Row[]{if(Array.isArray(v))return v.flatMap(nodes);if(!v||typeof v!=='object')return[];const n=v as Row;return[n,...nodes(n.props?.children)];}
function find(scope:Hooks,type:string,label?:string){const n=nodes(scope.tree).find(n=>n.type===type&&(!label||n.props.label===label||n.props.title===label));assert.ok(n,`${type}:${label}`);return n.props;}
function field(scope:Hooks,label:string){return find(scope,'YouthField',label);}
function change(scope:Hooks,label:string,value:string){field(scope,label).onChange(value);update(scope);}
async function press(scope:Hooks,label:string){const node=nodes(scope.tree).find(n=>n.props.label===label||n.props.title===label);assert.ok(node,label);node.props.onPress();await settle(scope);}
const writes=()=>state.requests.filter((r:Row)=>r.method&&r.method!=='GET');
function deferred(){let resolve!:(v:unknown)=>void;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
describe('actual mobile youth source boundary',()=>{
 beforeEach(async()=>{for(const s of scopes.splice(0))s.unmount();timers.clear();await privacy.clearYouthResources();provider.foreground=true;provider.foregroundEpoch=0;appListeners.clear();Object.assign(state,{actualProvider:null,appState:'active',account:true,monotonic:1000,requests:[],routes:[],params:[],confirm:true,confirmations:[],dispatched:[],expired:0,fileClears:0,uploadFiles:[],uploadIds:[]});state.onRequest=async(path:string,options:Row)=>options.method?receipt({...options.body,operation:path.includes('/extensions')?'profile.extend':options.method==='PATCH'?'profile.patch':'profile.create'}):path.startsWith('/youth?')?list():detail();});
 after(()=>{for(const s of scopes)s.unmount();delete(globalThis as Row)[key];});
 test('actual youth provider fences an old response and captured navigation across batched Android blur and focus',async()=>{
  const p=await mount('provider',{token:'synthetic-youth-a',isAccount:()=>state.account,expireSession:async()=>state.expired++});
  const s=await mount('detail',{id:'youth-a'});const navigate=find(s,'YouthRow','개인 일정').onPress;
  const old=deferred();state.onRequest=async()=>old.promise;find(s,'TextAction','기본정보 새로고침').onPress();await tick();
  appEvent('blur');appEvent('focus');navigate();assert.equal(state.routes.length,0,'old callback must require a new foreground snapshot');
  state.onRequest=async()=>{throw new ApiError('fresh revoked',404);};old.resolve(detail({youth:basic({name:'이전 권한 본문'})}));
  await tick();update(p);update(s);await settle(s);
  assert.doesNotMatch(JSON.stringify(s.tree),/이전 권한 본문|합성 청소년/);assert.equal(state.expired,0);
  assert.ok(state.requests.filter((r:Row)=>r.path==='/youth/youth-a').length>=3,'resume must start a fresh GET');
 });
 test('actual youth provider epoch masks a previously audited contact until fresh basic permission succeeds',async()=>{
  const p=await mount('provider',{token:'synthetic-youth-a',isAccount:()=>state.account,expireSession:async()=>state.expired++});
  state.onRequest=async(path:string)=>path.endsWith('/contacts')?view('contacts'):detail();const s=await mount('detail',{id:'youth-a'});await press(s,'연락처 확인');assert.match(JSON.stringify(s.tree),/010-1234-5678/);
  const fresh=deferred();state.onRequest=async()=>fresh.promise;appEvent('blur');appEvent('focus');update(p);s.render();
  assert.doesNotMatch(JSON.stringify(s.tree),/010-1234-5678|합성 청소년/,'first resumed render must mask the old snapshot before effects');s.flush();
  fresh.resolve(detail({permissions:{...permissions,canViewYouthContacts:false}}));await settle(s);
  assert.doesNotMatch(JSON.stringify(s.tree),/010-1234-5678/);assert.equal(writes().length,1,'resume must never auto-audit contacts');
 });
 test('actual youth provider retains an uncertain immutable write after a foreground transition',async()=>{
  const p=await mount('provider',{token:'synthetic-youth-a',isAccount:()=>state.account,expireSession:async()=>state.expired++});const s=await mount('editor');change(s,'이름','보존할 새 이름');
  const ack=deferred();state.onRequest=async(_path:string,o:Row)=>o.method?ack.promise:list();const save=find(s,'PrimaryButton','청소년 정보 저장').onPress;save();await tick();const original=writes()[0].body;
  appEvent('blur');appEvent('focus');ack.resolve(receipt(original));await tick();update(p);update(s);await settle(s);
  assert.equal(field(s,'이름').value,'보존할 새 이름');assert.equal(writes().length,1);save();await settle(s);assert.equal(writes().length,1);
  state.onRequest=async(path:string)=>path.startsWith('/youth/mutations/')?receipt(original):list();await press(s,'원래 저장 결과 확인');
  assert.ok(state.requests.some((r:Row)=>r.path==='/youth/mutations/'+original.requestId));assert.equal(writes().length,1);assert.equal(state.expired,0);
 });
 test('fresh basic detail never automatically audits contacts/details',async()=>{const s=await mount('detail',{id:'youth-a'});assert.equal(writes().length,0);assert.equal(JSON.stringify(s.tree).includes('birthDate'),false);await press(s,'기본정보 새로고침');assert.equal(writes().length,0);});
 test('explicit audit opens private fields then monotonic expiry masks without new audit',async()=>{state.onRequest=async(path:string)=>path.endsWith('/details')?view('details'):detail();const s=await mount('detail',{id:'youth-a'});await press(s,'상세정보 확인');assert.match(JSON.stringify(s.tree),/2010년 3월 4일/);state.monotonic=301001;for(const fn of [...timers.values()])fn();update(s);assert.doesNotMatch(JSON.stringify(s.tree),/2010년 3월 4일/);assert.equal(writes().length,1);});
 test('unknown explicit contact audit retries original key and foreground resume has no autoaudit',async()=>{const s=await mount('detail',{id:'youth-a'});state.onRequest=async()=>{throw new ApiError('lost',0);};await press(s,'연락처 확인');const first=writes()[0].body;s.blur();state.onRequest=async()=>detail();s.focus();await settle(s);assert.equal(writes().length,1);state.onRequest=async()=>view('contacts');await press(s,'같은 연락처 열람 요청 확인');assert.deepEqual(writes()[1].body,first);});
 test('fresh focus503 masks PII; denied404 clears private payload and captured controls',async()=>{state.onRequest=async(path:string)=>path.endsWith('/contacts')?view('contacts'):detail();const s=await mount('detail',{id:'youth-a'});await press(s,'연락처 확인');const nav=find(s,'YouthRow','개인 일정').onPress;s.blur();state.onRequest=async()=>{throw new ApiError('fresh failed',503);};s.focus();await settle(s);assert.doesNotMatch(JSON.stringify(s.tree),/010-1234-5678/);nav();assert.equal(state.routes.length,0);state.onRequest=async()=>{throw new ApiError('revoked',404);};await press(s,'기본정보 새로고침').catch(()=>{});assert.doesNotMatch(JSON.stringify(s.tree),/010-1234-5678/);});
 test('unrevealed private edit OMITs birth/contact and preserves basic dirty input',async()=>{const s=await mount('editor',{id:'youth-a'});assert.equal(nodes(s.tree).some(n=>n.props.label==='생년월일'),false);change(s,'이름','변경 이름');await press(s,'청소년 정보 저장');assert.deepEqual(writes()[0].body.patch,{name:'변경 이름'});assert.equal(writes()[0].body.expectedUpdatedAt,iso);});
 test('manager write-only create accepts private inputs without view permissions',async()=>{state.onRequest=async(path:string,opts:Row)=>opts.method?receipt(opts.body):{...list(),permissions:{...permissions,canViewYouthDetails:false,canViewYouthContacts:false,canDownloadYouthDocuments:false}};const s=await mount('editor');change(s,'이름','등록 이름');change(s,'생년월일','2010-03-04');change(s,'본인 연락처','010-1234-5678');await press(s,'청소년 정보 저장');assert.equal(writes()[0].body.birthDate,'2010-03-04');assert.equal(writes()[0].body.phone,'010-1234-5678');});
 test('400 fields preserve input and create captured save cannot duplicate after acknowledged result',async()=>{const s=await mount('editor');change(s,'이름','등록 이름');state.onRequest=async()=>{throw new ApiError('invalid',400,{name:'확인'});};await press(s,'청소년 정보 저장');assert.equal(field(s,'이름').value,'등록 이름');state.onRequest=async(path:string,options:Row)=>options.method?receipt(options.body):list();change(s,'이름','다시 등록 이름');const save=find(s,'PrimaryButton','청소년 정보 저장').onPress;save();save();await settle(s);const count=writes().length;save();await settle(s);assert.equal(writes().length,count);});
 test('unknown201 plus receipt404 preserves immutable key and exact payload',async()=>{const s=await mount('editor');change(s,'이름','불명확 등록');state.onRequest=async()=>{throw new ApiError('invalid JSON',201);};await press(s,'청소년 정보 저장');const body=writes()[0].body;state.onRequest=async()=>{throw new ApiError('not recorded',404);};await press(s,'원래 저장 결과 확인');assert.equal(field(s,'이름').value,'불명확 등록');change(s,'이름','바뀌면 안 됨');assert.equal(field(s,'이름').value,'불명확 등록');state.onRequest=async(path:string)=>{throw new ApiError(path.includes('/mutations/')?'not recorded':'retry response lost',path.includes('/mutations/')?404:0);};await press(s,'같은 저장 요청 재시도');assert.deepEqual(writes()[1].body,body);});
 test('CAS conflict requires latest GET and explicit baseline choice, input survives',async()=>{const s=await mount('editor',{id:'youth-a'});change(s,'이름','내 변경 입력');state.onRequest=async()=>{throw new ApiError('CAS',409,undefined,'YOUTH_CONFLICT');};await press(s,'청소년 정보 저장');state.onRequest=async()=>detail({youth:basic({updatedAt:newer,name:'다른 직원 수정'})});await press(s,'최신 청소년 정보 확인');assert.equal(field(s,'이름').value,'내 변경 입력');await press(s,'내 입력 유지하고 최신 기준 선택');state.onRequest=async(path:string,opts:Row)=>opts.method?receipt({...opts.body,operation:'profile.patch'}):detail();await press(s,'청소년 정보 저장');assert.equal(writes()[1].body.expectedUpdatedAt,newer);assert.equal(writes()[1].body.patch.name,'내 변경 입력');});
 test('dirty leave cancellation and late account approval cannot dispatch',async()=>{const s=await mount('editor');change(s,'이름','보존할 입력');state.confirm=false;s.prevent.callback({data:{action:'BACK'}});await tick();assert.equal(state.dispatched.length,0);assert.equal(field(s,'이름').value,'보존할 입력');state.confirm=true;s.prevent.callback({data:{action:'BACK'}});state.account=false;await tick();assert.equal(state.dispatched.length,0);});
 test('late account audited contact response never publishes PII',async()=>{const s=await mount('detail',{id:'youth-a'}),pending=deferred();state.onRequest=async()=>pending.promise;find(s,'TextAction','연락처 확인').onPress();state.account=false;pending.resolve(view('contacts'));await settle(s);assert.doesNotMatch(JSON.stringify(s.tree),/010-1234-5678/);});
 test('extension UI preserves details/manage intersection',async()=>{state.onRequest=async()=>detail({permissions:{...permissions,canViewYouthDetails:false}});const s=await mount('extension',{id:'youth-a'});assert.equal(nodes(s.tree).some(n=>n.props.title==='퇴소연장 저장'),false);});
 test('unknown learning check holds desired state and both CAS tokens; retry does not flip',async()=>{const curriculum=[{id:'s',label:'1학기',units:[{id:'u',label:'단원',subunits:[{id:'1-1',label:'소인수'}]}]}];state.onRequest=async()=>({...detail(),subject:'math',subunitId:'1-1',curriculum,youthUpdatedAt:iso,concepts:[{id:'c',content:'개념',updatedAt:newer,checked:false,checkedAt:null}]});const s=await mount('learning',{id:'youth-a'});state.onRequest=async(path:string)=>{throw new ApiError(path.includes('/mutations/')?'not recorded':'lost',path.includes('/mutations/')?404:0);};await press(s,'개념');const body=writes()[0].body;assert.equal(body.checked,true);assert.equal(body.expectedYouthUpdatedAt,iso);assert.equal(body.expectedConceptUpdatedAt,newer);await press(s,'같은 저장 요청 재시도');assert.deepEqual(writes()[1].body,body);});
 test('private edit user input survives monotonic expiry and explicit authorized re-open',async()=>{state.onRequest=async(path:string)=>path.endsWith('/contacts')?view('contacts'):detail();const scope=await mount('editor',{id:'youth-a'});await press(scope,'연락처 수정용 열람');change(scope,'본인 연락처','010-9999-8888');state.monotonic=301001;for(const fn of [...timers.values()])fn();update(scope);assert.equal(nodes(scope.tree).some(n=>n.props.label==='본인 연락처'),false);await press(scope,'연락처 수정용 열람');assert.equal(field(scope,'본인 연락처').value,'010-9999-8888');assert.equal(writes().length,2);});
 test('known expired private view permits a new explicit key; no automatic POST',async()=>{const scope=await mount('editor',{id:'youth-a'});state.onRequest=async()=>{throw new ApiError('expired',410,undefined,'VIEW_REQUEST_EXPIRED');};await press(scope,'연락처 수정용 열람');const original=writes()[0].body.requestId;state.onRequest=async()=>view('contacts');await press(scope,'연락처 수정용 열람');assert.notEqual(writes()[1].body.requestId,original);});
 test('confirmed write403 masks cached youth and clears draft immediately',async()=>{const scope=await mount('editor',{id:'youth-a'});change(scope,'이름','PRIVATE_INPUT');state.onRequest=async()=>{throw new ApiError('no permission',403);};await press(scope,'청소년 정보 저장');assert.doesNotMatch(JSON.stringify(scope.tree),/PRIVATE_INPUT|합성 청소년/);assert.equal(nodes(scope.tree).some(n=>n.type==='YouthField'),false);});
 test('common time movement keeps original total-minute slot/token and sends desired total minute',async()=>{const item={id:'schedule',weekday:1,startHour:9,startMinute:540,endHour:10,endMinute:600,content:'원래 일정',updatedAt:iso};state.onRequest=async()=>({today:'2026-10-04',permissions,weekday:1,items:[item]});const scope=await mount('common');await press(scope,'원래 일정');assert.equal(field(scope,'시작 시간').value,'09:00');change(scope,'시작 시간','10:00');change(scope,'종료 시간','11:00');state.onRequest=async(path:string)=>{throw new ApiError(path.includes('/mutations/')?'not recorded':'lost',path.includes('/mutations/')?404:0);};await press(scope,'공통 일정 저장');const body=writes()[0].body;assert.equal(body.startMinute,600);assert.equal(body.endMinute,660);assert.deepEqual(body.baselines,[{weekday:1,startMinute:540,scheduleId:'schedule',expectedUpdatedAt:iso}]);await press(scope,'같은 저장 요청 재시도');assert.deepEqual(writes()[1].body,body);});
 test('readonly personal row opens recurrence metadata but cannot change or save',async()=>{const schedule={id:'personal',youthId:'youth-a',content:'공부 일정',scheduleType:'GENERAL',hospitalName:null,escortType:null,escortUserId:null,escortName:null,nextAppointmentDate:null,startMinute:540,endMinute:600,selectionMode:'DATES',occurrenceDates:['2026-10-04','2026-10-05'],recurrenceWeekdays:[],recurrenceStartDate:null,recurrenceEndDate:null,updatedAt:iso};state.onRequest=async()=>({...detail({permissions:{...permissions,canManageYouth:false}}),date:'2026-10-04',month:'2026-10',schedules:[schedule],staffOptions:[]});const scope=await mount('personal',{id:'youth-a'});assert.equal(find(scope,'YouthRow','공부 일정').disabled,false);await press(scope,'공부 일정');assert.equal(field(scope,'일정 날짜').value,'2026-10-04, 2026-10-05');change(scope,'일정 내용','다른 내용');assert.equal(field(scope,'일정 내용').value,'공부 일정');assert.equal(nodes(scope.tree).some(n=>n.props.title==='개인 일정 저장'),false);assert.equal(writes().length,0);});

 test('uncertain retry checks own receipt first; matching committed proof prevents a second POST',async()=>{
  const scope=await mount('editor');change(scope,'이름','원래 등록');
  state.onRequest=async()=>{throw new ApiError('lost',0);};await press(scope,'청소년 정보 저장');
  const first=writes()[0].body;
  state.onRequest=async(path:string)=>path.includes('/mutations/')?receipt(first):list();
  await press(scope,'같은 저장 요청 재시도');
  assert.equal(writes().length,1);assert.equal(field(scope,'이름').value,'');
  assert.ok(state.requests.some((r:Row)=>r.path===`/youth/mutations/${first.requestId}`));
 });
 test('receipt lookup failure never retransmits; only explicit retry after NOT_FOUND uses original payload',async()=>{
  const scope=await mount('editor');change(scope,'이름','원래 등록');state.onRequest=async()=>{throw new ApiError('lost',0);};await press(scope,'청소년 정보 저장');
  const first=writes()[0].body;await press(scope,'같은 저장 요청 재시도');assert.equal(writes().length,1);
  state.onRequest=async(path:string,opts:Row)=>{if(path.includes('/mutations/'))throw new ApiError('not recorded',404);if(opts.method)return receipt(opts.body);return list();};
  await press(scope,'같은 저장 요청 재시도');assert.equal(writes().length,2);assert.deepEqual(writes()[1].body,first);
 });
 test('manager without document-read permission can attach prepared files without fetching file metadata',async()=>{
  state.uploadFiles=[{id:'upload-one'}];state.uploadIds=['upload-one'];
  const own=detail({permissions:{...permissions,canDownloadYouthDocuments:false}});
  state.onRequest=async(path:string,opts:Row)=>opts.method?receipt({...opts.body,operation:'document.attach'},detail({youth:basic({updatedAt:newer})})):own;
  const scope=await mount('documents',{id:'youth-a'});assert.equal(state.requests.some((r:Row)=>r.path.endsWith('/documents')),false);
  await press(scope,'준비된 결정문 등록');assert.equal(writes()[0].body.expectedYouthUpdatedAt,iso);
  state.uploadFiles=[{id:'upload-two'}];state.uploadIds=['upload-two'];update(scope);await press(scope,'준비된 결정문 등록');
  assert.equal(writes()[1].body.expectedYouthUpdatedAt,newer);
 });

 test('actual personal DELETE public parent+scheduleId proof confirms success without unknown recovery',async()=>{
  const schedule={id:'personal',youthId:'youth-a',content:'삭제할 일정',scheduleType:'GENERAL',hospitalName:null,escortType:null,escortUserId:null,escortName:null,nextAppointmentDate:null,startMinute:540,endMinute:600,selectionMode:'DATES',occurrenceDates:['2026-10-04'],recurrenceWeekdays:[],recurrenceStartDate:null,recurrenceEndDate:null,updatedAt:iso};
  let deleted=false;
  state.onRequest=async(_path:string,opts:Row)=>{
   if(opts.method==='DELETE'){
    deleted=true;
    return {ok:true,replayed:false,requestId:opts.body.requestId,operation:'personal.delete',targetType:'YouthPersonalSchedule',targetId:'personal',youthId:'youth-a',outcome:'deleted',committedAt:iso,committedUpdatedAt:newer,result:{youth:basic({updatedAt:newer}),scheduleId:'personal'}};
   }
   return {...detail(),date:'2026-10-04',month:'2026-10',schedules:deleted?[]:[schedule],staffOptions:[]};
  };
  const scope=await mount('personal',{id:'youth-a'});await press(scope,'삭제할 일정');await press(scope,'개인 일정 삭제');
  assert.equal(writes().length,1);assert.equal(writes()[0].method,'DELETE');
  assert.match(JSON.stringify(scope.tree),/개인 일정 변경이 확정되었습니다/);
  assert.equal(nodes(scope.tree).some(n=>n.props.label==='원래 저장 결과 확인'),false);
  assert.equal(nodes(scope.tree).some(n=>n.props.title==='개인 일정 저장'),false);
 });

});
