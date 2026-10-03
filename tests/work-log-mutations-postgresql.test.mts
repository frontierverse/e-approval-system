import assert from "node:assert/strict";
import { test } from "node:test";

const ciDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
test("CI PostgreSQL executes real work-log domain CAS, ABA, atomic audit/projection and optional SQL recovery", {
  skip: process.env.GITHUB_ACTIONS !== "true", timeout: 30000,
}, async () => {
  if (process.env.DATABASE_URL !== ciDatabaseUrl || process.env.DIRECT_URL !== ciDatabaseUrl) throw new Error("Disposable CI database required");
  const [{ PrismaClient, Prisma }, { PrismaPg }, mutations, queries, schedules, { getWorkLogToday }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("@prisma/adapter-pg"), import("../src/lib/work-log-mutations.ts"),
    import("../src/lib/work-logs.ts"), import("../src/lib/work-log-linked-schedules.ts"), import("../src/lib/work-log-core.ts"),
  ]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: ciDatabaseUrl, max: 1 }) });
  const rollbackFixture = new Error("work-log-domain-fixture-rollback");
  let verified = false;
  try {
    await assert.rejects(db.$transaction(async tx => {
      const department = await tx.department.create({ data: { id:"ci-worklog-domain-department", name:"검증 부서", code:"CI_WORKLOG_DOMAIN" } });
      const position = await tx.position.create({ data: { id:"ci-worklog-domain-position", name:"시설장", level:1 } });
      const actor = await tx.user.create({ data: { id:"ci-worklog-domain-writer", name:"검증 직원", role:"ADMIN", departmentId:department.id, positionId:position.id } });
      const workDate = getWorkLogToday(), values = { workDate, keyword:"업무", content:"업무 내용" };
      const store = { $transaction: async (operation:(client:typeof tx)=>Promise<unknown>) => {
        await tx.$executeRaw(Prisma.sql`SAVEPOINT work_log_domain_operation`);
        try { const value = await operation(tx); await tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT work_log_domain_operation`); return value; }
        catch (error) { await tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT work_log_domain_operation`); await tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT work_log_domain_operation`); throw error; }
      } } as unknown as NonNullable<Parameters<typeof mutations.saveOwnWorkLog>[0]["db"]>;
      const context = { actor, db:store, client:"mobile" as const, today:workDate, now:()=>new Date(0) };
      const created = await mutations.saveOwnWorkLog(context, { values, manualLogId:null, expectedUpdatedAt:"" });
      assert.equal(created.change,"create");
      const id = created.entry.manualLogId!, initialToken = created.entry.manualUpdatedAt!;
      const input = { values, manualLogId:id, expectedUpdatedAt:initialToken };
      await assert.rejects(mutations.saveOwnWorkLog(context, {...input, expectedUpdatedAt:""}), (error:unknown)=>error instanceof mutations.WorkLogMutationError && error.code==="INVALID_REQUEST");
      const unchanged = await mutations.saveOwnWorkLog(context,input);assert.equal(unchanged.change,"unchanged");assert.equal(unchanged.entry.manualUpdatedAt,initialToken);
      assert.equal(await tx.auditLog.count({where:{targetId:id}}),1);
      const updated = await mutations.saveOwnWorkLog(context,{...input,values:{...values,content:"수정 내용"}});
      assert.equal(new Date(updated.entry.manualUpdatedAt!).getTime(),new Date(initialToken).getTime()+1);
      await assert.rejects(mutations.saveOwnWorkLog(context,{...input,values:{...values,content:"수정 내용"}}), (error:unknown)=>error instanceof mutations.WorkLogMutationError && error.code==="WORK_LOG_CONFLICT");
      const updatedToken = updated.entry.manualUpdatedAt!;
      await tx.$executeRaw(Prisma.sql`SAVEPOINT duplicate_work_log`);
      await assert.rejects(tx.workLog.create({data:{authorId:actor.id,workDate:new Date(workDate+"T00:00:00Z"),keyword:"중복",content:"중복"}}));
      await tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT duplicate_work_log`);
      await tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT duplicate_work_log`);
      const beforeAudits = await tx.auditLog.count({where:{targetId:id}});
      await tx.$executeRaw(Prisma.sql`ALTER TABLE "AuditLog" ADD CONSTRAINT "ci_worklog_domain_audit_failure" CHECK ("actorId" <> 'ci-worklog-domain-writer' OR "metadata"->>'changeType' <> 'workLog.update') NOT VALID`);
      await assert.rejects(mutations.saveOwnWorkLog(context,{...input,expectedUpdatedAt:updatedToken,values:{...values,content:"must rollback"}}));
      assert.equal((await tx.workLog.findUniqueOrThrow({where:{id}})).content,"수정 내용");assert.equal(await tx.auditLog.count({where:{targetId:id}}),beforeAudits);
      await tx.$executeRaw(Prisma.sql`ALTER TABLE "AuditLog" DROP CONSTRAINT "ci_worklog_domain_audit_failure"`);
      // Force a real SQL error after a mutation; the shared operation must roll it back.
      const failureStore = { $transaction: async (operation:(client:typeof tx)=>Promise<unknown>) => store.$transaction(async client => {
        const failedClient = new Proxy(client,{get(target,key){if(key==="approvalDocument")return {findMany:()=>target.$queryRawUnsafe('SELECT * FROM "ci_missing_worklog_table"')};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
        return operation(failedClient);
      }) } as unknown as typeof store;
      await assert.rejects(mutations.saveOwnWorkLog({...context,db:failureStore},{...input,expectedUpdatedAt:updatedToken,values:{...values,content:"projection must rollback"}}));
      assert.equal((await tx.workLog.findUniqueOrThrow({where:{id}})).content,"수정 내용");assert.equal(await tx.auditLog.count({where:{targetId:id}}),beforeAudits);
      await assert.rejects(mutations.deleteOwnWorkLog({...context,db:failureStore},{manualLogId:id,expectedUpdatedAt:updatedToken,workDate}));
      assert.ok(await tx.workLog.findUnique({where:{id}}));assert.equal(await tx.auditLog.count({where:{targetId:id}}),beforeAudits);
      const youth = await tx.youth.create({data:{id:"ci-worklog-domain-youth",name:"검증 청소년"}});
      await tx.youthPersonalSchedule.create({data:{youthId:youth.id,content:"참고 일정",selectionMode:"DATES",startMinute:540,endMinute:600,occurrenceDates:[workDate]}});
      assert.equal((await schedules.getWorkLogLinkedSchedules(workDate,tx,workDate)).length,1);
      await tx.youth.update({where:{id:youth.id},data:{actualDischargeDate:workDate}});assert.deepEqual(await schedules.getWorkLogLinkedSchedules(workDate,tx,workDate),[]);
      // Optional query SQL fails inside its own savepoint; the same snapshot survives.
      const optionalFailure = new Proxy(tx,{get(target,key){if(key==="youthPersonalSchedule")return {findMany:()=>target.$queryRawUnsafe('SELECT * FROM "ci_missing_worklog_schedule_table"')};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
      const page = await queries.getWorkLogPageData({authorId:actor.id,selectedDate:workDate,today:workDate},optionalFailure);
      assert.equal(page.selectedLog!.manualLogId,id);assert.deepEqual(page.linkedScheduleState,{status:"error"});assert.ok(await tx.workLog.findUnique({where:{id}}));
      const completed = await tx.staffTask.create({data:{id:"ci-worklog-domain-task",requestId:"ci-worklog-domain-task-request",title:"자동 업무",createdById:actor.id,assigneeId:actor.id,completedAt:new Date(workDate+"T01:00:00Z")}});
      const deleted = await mutations.deleteOwnWorkLog(context,{manualLogId:id,expectedUpdatedAt:updatedToken,workDate});assert.equal(deleted.kind,"deleted");assert.equal(deleted.combinedEntry!.manualLogId,null);assert.equal(deleted.combinedEntry!.completedTasks![0].id,completed.id);
      const replacement = await tx.workLog.create({data:{id:"ci-worklog-domain-new-id",authorId:actor.id,workDate:new Date(workDate+"T00:00:00Z"),keyword:"새 등록",content:"동일 시각 재등록",updatedAt:new Date(updatedToken)}});
      await assert.rejects(mutations.saveOwnWorkLog(context,{...input,expectedUpdatedAt:updatedToken,values:{...values,content:replacement.content}}),(error:unknown)=>error instanceof mutations.WorkLogMutationError&&error.code==="WORK_LOG_CONFLICT");
      const missing = await mutations.deleteOwnWorkLog(context,{manualLogId:id,expectedUpdatedAt:updatedToken,workDate});assert.equal(missing.kind,"missing");assert.equal(missing.combinedEntry!.manualLogId,replacement.id);
      assert.equal((await tx.workLog.findUniqueOrThrow({where:{id:replacement.id}})).content,replacement.content);
      verified = true;throw rollbackFixture;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:25000}), (error:unknown)=>error===rollbackFixture);
    assert.equal(verified,true);
  } finally { await db.$disconnect(); }
});
