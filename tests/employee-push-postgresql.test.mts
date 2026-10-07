import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Prisma } from "../src/generated/prisma/client.ts";
const ciUrl="postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
test("CI PostgreSQL enforces push sources, durable dedup, chat replay and transactional rollback",{skip:process.env.GITHUB_ACTIONS!=="true",timeout:60000},async()=>{
  if(process.env.DATABASE_URL!==ciUrl||process.env.DIRECT_URL!==ciUrl)throw Error("Exact disposable CI database required");
  const [{PrismaClient},{PrismaPg},{queueStaffPushEvent},{sendStaffChatMessage}]=await Promise.all([
    import("../src/generated/prisma/client.ts"),import("@prisma/adapter-pg"),import("../src/lib/mobile-push-events.ts"),import("../src/lib/staff-chat.ts")]);
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:ciUrl,max:4})}),prefix="ci-push-"+randomUUID();
  await db.department.create({data:{id:prefix+"-dept",name:"합성 푸시 검증",code:prefix}});
  await db.position.create({data:{id:prefix+"-position",name:"합성 검증",level:1}});
  const actor=await db.user.create({data:{id:prefix+"-actor",name:"합성 발신 직원",departmentId:prefix+"-dept",positionId:prefix+"-position"}});
  const peer=await db.user.create({data:{id:prefix+"-peer",name:"합성 수신 직원",departmentId:prefix+"-dept",positionId:prefix+"-position"}});
  const session=await db.mobileSession.create({data:{userId:peer.id,tokenHash:prefix,expiresAt:new Date(Date.now()+3600000)}});
  const sub=await db.mobilePushSubscription.create({data:{sessionId:session.id,expoToken:"ExpoPushToken["+prefix+"]"}});
  try {
    const input={eventKey:prefix,kind:"TASK_ASSIGNED"as const,targetId:"synthetic-task",userIds:[peer.id,actor.id],actorId:actor.id,deferDispatch:true};
    await db.$transaction(tx=>queueStaffPushEvent(tx,input));await db.$transaction(tx=>queueStaffPushEvent(tx,input));
    assert.equal(await db.mobilePushEvent.count({where:{eventKey:prefix}}),1);
    const event=await db.mobilePushEvent.findFirstOrThrow({where:{eventKey:prefix}});
    assert.equal(event.userId,peer.id);assert.equal(await db.mobilePushDelivery.count({where:{eventId:event.id}}),1);
    await assert.rejects(db.mobilePushDelivery.create({data:{subscriptionId:sub.id}})); // CHECK: neither source.
    await assert.rejects(db.mobilePushDelivery.create({data:{subscriptionId:sub.id,eventId:event.id}})); // Unique device/event.
    await assert.rejects(db.$transaction(async tx=>{await queueStaffPushEvent(tx,{...input,eventKey:prefix+"-rollback"});throw Error("Synthetic business rollback");}));
    assert.equal(await db.mobilePushEvent.count({where:{eventKey:prefix+"-rollback"}}),0);
    // A real chat mutation and its matching replay must create one queue entry,
    // using the very same transaction as the persisted message.
    const message=await sendStaffChatMessage(actor.id,{peerId:peer.id,body:"합성 메시지",requestId:prefix},{db});
    await sendStaffChatMessage(actor.id,{peerId:peer.id,body:"합성 메시지",requestId:prefix},{db});
    assert.equal(await db.mobilePushEvent.count({where:{eventKey:`chat:${message.id}`,userId:peer.id}}),1);
    const locked={...db,$transaction:<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>)=>db.$transaction(async tx=>{const result=await fn(tx);throw Object.assign(Error("Synthetic commit rollback"),{result});})};
    await assert.rejects(sendStaffChatMessage(actor.id,{peerId:peer.id,body:"실패할 합성 메시지",requestId:prefix+"-failed"},{db:locked as typeof db}));
    assert.equal(await db.staffChatMessage.count({where:{senderId:actor.id,requestId:prefix+"-failed"}}),0);
    const rls=await db.$queryRaw<{relrowsecurity:boolean}[]>`SELECT relrowsecurity FROM pg_class WHERE oid='"MobilePushEvent"'::regclass`;
    assert.equal(rls[0]?.relrowsecurity,true);
  } finally {
    await db.staffChatMessage.deleteMany({where:{senderId:actor.id}});
    await db.user.deleteMany({where:{id:{in:[actor.id,peer.id]}}});
    await db.position.delete({where:{id:prefix+"-position"}});await db.department.delete({where:{id:prefix+"-dept"}});await db.$disconnect();
  }
});
