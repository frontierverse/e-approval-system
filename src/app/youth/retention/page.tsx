import type { Metadata } from "next";
import { YouthRetentionBoard } from "@/components/youth-retention-board";
import { requireAdmin } from "@/lib/auth";
import { getYouthRetentionRecords } from "@/lib/youth-retention";
import { getYouthLearningScheduleToday } from "@/lib/youth-management-core";
import { saveYouthRetentionAction, readRetainedYouthAction, purgeYouthRecordAction, getYouthRetentionRecordsAction } from "./actions";

export const metadata: Metadata = { title: "퇴소기록 관리" };
export default async function YouthRetentionPage() {
  await requireAdmin();
  return <YouthRetentionBoard data={await getYouthRetentionRecords()} today={getYouthLearningScheduleToday()} save={saveYouthRetentionAction} read={readRetainedYouthAction} purge={purgeYouthRecordAction} refresh={getYouthRetentionRecordsAction} />;
}
