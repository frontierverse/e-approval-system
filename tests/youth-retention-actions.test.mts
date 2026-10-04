import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, after, test } from "node:test";
import ts from "typescript";
const key="__syntheticYouthRetentionActionTest__";
type ActionFixture = { auth: number; read: number; purge: number; save: number; privateRead: number; cache: number; records: unknown[]; outcome: unknown; authError?: Error; readError?: Error; purgeError?: Error; cacheError?: Error; [name: string]: unknown };
const h = {} as ActionFixture;
const fixtureGlobals = globalThis as unknown as Record<string, unknown>;
fixtureGlobals[key] = h;
const mock=Buffer.from(`const h=globalThis[${JSON.stringify(key)}];
export class YouthPurgeError extends Error{constructor(message,code="INVALID_REQUEST"){super(message);this.code=code;}}
class KnownError extends Error{};export const Prisma={PrismaClientKnownRequestError:KnownError};
export async function requireAdmin(){h.auth++;if(h.authError)throw h.authError;return{id:"synthetic-admin"};}
export async function getYouthRetentionRecords(){h.read++;if(h.readError)throw h.readError;return h.records;}
export async function purgeYouthRecord(id,input){h.purge++;if(h.purgeError)throw h.purgeError;return h.outcome;}
export async function saveYouthRetention(){h.save++;}export async function readRetainedYouth(){h.privateRead++;return{};}
export function revalidatePath(){h.cache++;if(h.cacheError)throw h.cacheError;}
export function unstable_rethrow(error){if(error?.digest?.startsWith("NEXT_"))throw error;}`).toString("base64");
const mockURL="data:text/javascript;base64,"+mock;
let source=readFileSync(new URL("../src/app/youth/retention/actions.ts",import.meta.url),"utf8");
for(const name of ["next/cache","next/navigation","@/generated/prisma/client","@/lib/auth","@/lib/youth-retention","@/lib/youth-purge"])source=source.replaceAll(JSON.stringify(name),JSON.stringify(mockURL));
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const actions=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const {YouthPurgeError}=await import(mockURL);
beforeEach(()=>{Object.keys(h).forEach(k=>delete h[k]);Object.assign(h,{auth:0,read:0,purge:0,save:0,privateRead:0,cache:0,records:[{id:"synthetic-youth",purgeStartedAt:"2026-10-04T00:00:00Z",purgedAt:null}],outcome:{status:"pending",youthId:"synthetic-youth",retentionVersion:1,progress:{phase:"waiting-provider",blockedReason:"WRITE_PENDING"}}});});
after(()=>{delete fixtureGlobals[key];});
const input={version:0,confirmationName:"synthetic",reviewedCopies:true};

test("actual status action is authorized and reads projections with zero mutation or cache invalidation",async()=>{
 assert.deepEqual(await actions.getYouthRetentionRecordsAction(),{ok:true,data:h.records});
 assert.equal(h.auth,1);assert.equal(h.read,1);assert.equal(h.purge+h.save+h.privateRead+h.cache,0);
});
test("inactive status authorization prevents even the projection read",async()=>{
 h.authError=Error("authorization denied");await assert.rejects(actions.getYouthRetentionRecordsAction(),h.authError);assert.equal(h.read+h.purge,0);
});
test("pending outcome survives a postcommit cache failure without turning into a completed outcome",async()=>{
 h.cacheError=Error("synthetic cache failure");const old=console.error;console.error=()=>{};
 try{const result=await actions.purgeYouthRecordAction("synthetic-youth",input);assert.equal(result.ok,true);assert.equal(result.purgeOutcome.status,"pending");assert.equal(result.data[0].purgedAt,null);assert.equal(h.purge,1);assert.equal(h.cache,1);}finally{console.error=old;}
});
test("unexpected provider/database details are masked and typed safe validation errors are retained",async()=>{
 h.purgeError=Error("SYNTHETIC_PRIVATE_KEY_MUST_NOT_RENDER");const result=await actions.purgeYouthRecordAction("synthetic-youth",input);assert.equal(result.ok,false);assert.doesNotMatch(result.error,/PRIVATE_KEY/);
 h.purgeError=new YouthPurgeError("기록이 변경되었습니다. 다시 확인하세요.","PURGE_CONFLICT");assert.equal((await actions.purgeYouthRecordAction("synthetic-youth",input)).error,h.purgeError!.message);
 h.readError=Error("SYNTHETIC_PRIVATE_ROW_MUST_NOT_RENDER");assert.doesNotMatch((await actions.getYouthRetentionRecordsAction()).error,/PRIVATE_ROW/);
});
test("framework authentication redirect from a status read is rethrown as the same object",async()=>{
 const redirect=Object.assign(Error("control flow"),{digest:"NEXT_REDIRECT;replace;/login;307;"});h.readError=redirect;
 await assert.rejects(actions.getYouthRetentionRecordsAction(),error=>error===redirect);assert.equal(h.purge+h.cache,0);
});
