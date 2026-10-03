import assert from "node:assert/strict";
import { test } from "node:test";

const ciDatabaseUrl="postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
function requireDisposable(){if(process.env.DATABASE_URL!==ciDatabaseUrl||process.env.DIRECT_URL!==ciDatabaseUrl)throw Error("Disposable CI database required");}
test("CI PostgreSQL executes actual schedule CAS, monotonic time, audit rollback and current hospital scope",{skip:process.env.GITHUB_ACTIONS!=="true",timeout:30000},async()=>{
 requireDisposable();
 const[{PrismaClient,Prisma},{PrismaPg},domain,queries,{getKoreanDateValue}]=await Promise.all([import("../src/generated/prisma/client.ts"),import("@prisma/adapter-pg"),import("../src/lib/work-schedule-mutations.ts"),import("../src/lib/work-schedules.ts"),import("../src/lib/document-archive-policy.ts")]);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:ciDatabaseUrl,max:1})}),rollback=Error("schedule-fixture-rollback");let verified=false;
 try{await assert.rejects(db.$transaction(async tx=>{
  const department=await tx.department.create({data:{id:"ci-schedule-domain-department",name:"검증 부서",code:"CI_SCHEDULE_DOMAIN"}}),position=await tx.position.create({data:{id:"ci-schedule-domain-position",name:"담당",level:1}});
  const actor=await tx.user.create({data:{id:"ci-schedule-domain-actor",name:"검증 직원",role:"USER",departmentId:department.id,positionId:position.id}});
  const store={$transaction:async(operation:(client:typeof tx)=>Promise<unknown>)=>{await tx.$executeRaw(Prisma.sql`SAVEPOINT schedule_domain_case`);try{const value=await operation(tx);await tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT schedule_domain_case`);return value;}catch(error){await tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT schedule_domain_case`);await tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT schedule_domain_case`);throw error;}}}as unknown as NonNullable<Parameters<typeof domain.saveWorkSchedule>[0]["db"]>;
  const ctx={actorId:actor.id,client:"mobile"as const,requestData:{},db:store},date="2197-11-23",input={scheduleDate:date,startMinute:540,endMinute:600,content:"검증 일정"};
  const transportInput={...input,manualScheduleId:null,expectedUpdatedAt:""};const first=await domain.saveWorkSchedule(ctx,transportInput);assert.equal(first.change,"create");const id=first.schedule!.id,initial=first.schedule!.updatedAt!;
  const source={id,expectedUpdatedAt:initial};assert.equal((await domain.saveWorkSchedule(ctx,input,source)).change,"unchanged");assert.equal(await tx.auditLog.count({where:{targetId:id}}),1);
  await assert.rejects(domain.saveWorkSchedule(ctx,input,{...source,expectedUpdatedAt:new Date(0).toISOString()}),(e:unknown)=>e instanceof domain.WorkScheduleMutationError&&e.code==="SCHEDULE_CONFLICT");
  await tx.workSchedule.update({where:{id},data:{updatedAt:new Date("2299-01-01T00:00:00Z")}});
  const futureSource={id,expectedUpdatedAt:"2299-01-01T00:00:00.000Z"},updated=await domain.saveWorkSchedule(ctx,{...input,content:"수정"},futureSource);
  assert.equal(updated.schedule!.updatedAt,"2299-01-01T00:00:00.001Z");const latest=updated.schedule!.updatedAt!;
  await assert.rejects(domain.saveWorkSchedule(ctx,{...input,startMinute:550,endMinute:610}),(e:unknown)=>e instanceof domain.WorkScheduleMutationError&&e.code==="SCHEDULE_OVERLAP");
  assert.equal((await domain.saveWorkSchedule(ctx,{...input,startMinute:600,endMinute:650})).change,"create");
  const before=await tx.auditLog.count({where:{targetId:id}});
  await tx.$executeRaw(Prisma.sql`ALTER TABLE "AuditLog" ADD CONSTRAINT "ci_schedule_audit_failure" CHECK ("actorId" <> 'ci-schedule-domain-actor' OR "metadata"->>'changeType' NOT IN ('workSchedule.update','workSchedule.delete')) NOT VALID`);
  await assert.rejects(domain.saveWorkSchedule(ctx,{...input,content:"rollback"},{id,expectedUpdatedAt:latest}));assert.equal((await tx.workSchedule.findUniqueOrThrow({where:{id}})).content,"수정");
  await assert.rejects(domain.deleteWorkSchedule(ctx,{id,expectedUpdatedAt:latest}));assert.ok(await tx.workSchedule.findUnique({where:{id}}));assert.equal(await tx.auditLog.count({where:{targetId:id}}),before);
  await tx.$executeRaw(Prisma.sql`ALTER TABLE "AuditLog" DROP CONSTRAINT "ci_schedule_audit_failure"`);
  assert.equal((await domain.deleteWorkSchedule(ctx,{id,expectedUpdatedAt:latest})).change,"deleted");
  const replacement=await tx.workSchedule.create({data:{id:"ci-schedule-domain-replacement",...input,weekday:1,startHour:9,endHour:10,updatedAt:new Date(latest)}});
  assert.equal((await domain.deleteWorkSchedule(ctx,{id,expectedUpdatedAt:latest})).change,"missing");assert.ok(await tx.workSchedule.findUnique({where:{id:replacement.id}}));
  await assert.rejects(domain.saveWorkSchedule(ctx,input,{id,expectedUpdatedAt:latest}),(e:unknown)=>e instanceof domain.WorkScheduleMutationError&&e.code==="NOT_FOUND");
  await assert.rejects(domain.saveWorkSchedule({...ctx,client:"web"},input,{scheduleDate:date,startMinute:540,baseline:{manualScheduleId:id,expectedUpdatedAt:latest}}),(e:unknown)=>e instanceof domain.WorkScheduleMutationError&&e.code==="SCHEDULE_CONFLICT");
  const today=getKoreanDateValue(),youth=await tx.youth.create({data:{id:"ci-schedule-domain-youth",name:"검증 청소년"}});
  await tx.youthPersonalSchedule.create({data:{youthId:youth.id,scheduleType:"HOSPITAL",content:"진료",hospitalName:"병원",escortName:"인솔자",selectionMode:"DATES",startMinute:480,endMinute:500,occurrenceDates:[today]}});
  assert.ok((await queries.getWorkSchedules(today.slice(0,7),tx,today)).some(row=>row.sourceType==="hospitalAppointment"&&row.youthName===youth.name));
  await tx.youth.update({where:{id:youth.id},data:{actualDischargeDate:today}});assert.ok(!(await queries.getWorkSchedules(today.slice(0,7),tx,today)).some(row=>row.youthName===youth.name));
  for(const [index,month]of ["0001-01","0099-12","0100-01","0999-12","9999-12"].entries()) {
    await tx.workSchedule.create({data:{id:`ci-schedule-range-${index}`,scheduleDate:month+"-01",weekday:1,startHour:9,startMinute:540,endHour:10,endMinute:600,content:"범위 검증"}});
  }
  for(const [index,month]of ["0001-01","0099-12","0100-01","0999-12","9999-12"].entries()) {
    const rows=(await queries.getWorkSchedules(month,tx,today)).filter(row=>row.sourceType==="manual");assert.deepEqual(rows.map(row=>row.id),[`ci-schedule-range-${index}`]);assert.ok(rows.every(row=>row.scheduleDate.startsWith(month+"-")));
  }
  await tx.user.update({where:{id:actor.id},data:{status:"INACTIVE"}});await assert.rejects(domain.saveWorkSchedule(ctx,{...input,startMinute:700,endMinute:750}),(e:unknown)=>e instanceof domain.WorkScheduleMutationError&&e.code==="UNAUTHORIZED");
  verified=true;throw rollback;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:25000}),e=>e===rollback);assert.equal(verified,true);}finally{await db.$disconnect();}
});

test("CI PostgreSQL Serializable domain prevents different-start concurrent overlaps and concurrent moves",{skip:process.env.GITHUB_ACTIONS!=="true",timeout:30000},async()=>{
 requireDisposable();
 const[{PrismaClient},{PrismaPg},domain]=await Promise.all([import("../src/generated/prisma/client.ts"),import("@prisma/adapter-pg"),import("../src/lib/work-schedule-mutations.ts")]);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:ciDatabaseUrl,max:4})}),suffix="ci-schedule-concurrency",ownedIds=new Set<string>();
 try{
  await db.department.create({data:{id:suffix+"-department",name:"동시성 검증",code:"CI_SCHEDULE_CONCURRENCY"}});await db.position.create({data:{id:suffix+"-position",name:"담당",level:1}});
  const actor=await db.user.create({data:{id:suffix+"-actor",name:"동시성 검증 직원",departmentId:suffix+"-department",positionId:suffix+"-position"}});
  // Gate each pair immediately after its first actual SQL overlap read. Both snapshots
  // initially see no conflicting row; PostgreSQL SSI must abort one, then the domain retries.
  function pairStore(){let entered=0,release:()=>void=()=>{};const ready=new Promise<void>(resolve=>{release=resolve;});return {$transaction:(operation:(tx:unknown)=>Promise<unknown>,options:object)=>db.$transaction(async tx=>{
   const schedules=new Proxy(tx.workSchedule,{get(target,key){if(key==="findFirst")return async(args:Parameters<typeof target.findFirst>[0])=>{const result=await target.findFirst(args);if(entered<2){entered++;if(entered===2)release();await ready;}return result;};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
   const proxied=new Proxy(tx,{get(target,key){if(key==="workSchedule")return schedules;const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});return operation(proxied);
  },options)}as unknown as NonNullable<Parameters<typeof domain.saveWorkSchedule>[0]["db"]>;}
  const base={actorId:actor.id,client:"mobile"as const,requestData:{}},date="2196-11-23",input={scheduleDate:date,startMinute:540,endMinute:600,content:suffix};
  const firstCtx={...base,db:pairStore()},results=await Promise.allSettled([domain.saveWorkSchedule(firstCtx,input),domain.saveWorkSchedule(firstCtx,{...input,startMinute:550,endMinute:610})]);
  const fulfilled=results.filter(result=>result.status==="fulfilled");for(const result of fulfilled){if(result.status==="fulfilled")ownedIds.add(result.value.schedule!.id);}assert.equal(fulfilled.length,1);
  const loser=results.find(result=>result.status==="rejected");assert.ok(loser&&loser.status==="rejected"&&loser.reason instanceof domain.WorkScheduleMutationError&&loser.reason.code==="SCHEDULE_OVERLAP");
  const touchCtx={...base,db:pairStore()},touches=await Promise.all([domain.saveWorkSchedule(touchCtx,{...input,startMinute:700,endMinute:750}),domain.saveWorkSchedule(touchCtx,{...input,startMinute:750,endMinute:800})]);touches.forEach(row=>ownedIds.add(row.schedule!.id));assert.equal(touches.length,2);
  const moving=await Promise.all([db.workSchedule.create({data:{...input,id:suffix+"-move-a",scheduleDate:"2196-11-24",weekday:1,startHour:9,endHour:10}}),db.workSchedule.create({data:{...input,id:suffix+"-move-b",scheduleDate:"2196-11-25",weekday:1,startHour:9,endHour:10}})]);moving.forEach(row=>ownedIds.add(row.id));
  const moveCtx={...base,db:pairStore()},moves=await Promise.allSettled(moving.map((row,index)=>domain.saveWorkSchedule(moveCtx,{...input,scheduleDate:"2196-11-26",startMinute:540+index*10,endMinute:600+index*10},{id:row.id,expectedUpdatedAt:row.updatedAt.toISOString()})));
  assert.equal(moves.filter(result=>result.status==="fulfilled").length,1);assert.ok(moves.some(result=>result.status==="rejected"&&result.reason instanceof domain.WorkScheduleMutationError&&result.reason.code==="SCHEDULE_OVERLAP"));
  assert.equal(await db.auditLog.count({where:{actorId:actor.id}}),4);assert.equal(await db.workSchedule.count({where:{scheduleDate:"2196-11-26",id:{in:[...ownedIds]}}}),1);
 }finally{
  // Committed synthetic rows are needed for independent connections. Cleanup only IDs
  // created by this guarded test; no shared business rows or date-wide delete.
  await db.auditLog.deleteMany({where:{actorId:suffix+"-actor"}});
  await db.workSchedule.deleteMany({where:{OR:[{id:{in:[...ownedIds]}},{id:{in:[suffix+"-move-a",suffix+"-move-b"]}}]}});
  await db.user.deleteMany({where:{id:suffix+"-actor"}});await db.position.deleteMany({where:{id:suffix+"-position"}});await db.department.deleteMany({where:{id:suffix+"-department"}});await db.$disconnect();
 }
});
