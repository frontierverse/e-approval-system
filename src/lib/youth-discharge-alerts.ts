import "server-only";

import {
  createYouthDischargeTopbarAlert,
  type YouthDischargeTopbarAlert,
} from "@/lib/youth-discharge-alerts-core";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { prisma } from "@/lib/prisma";

export async function getYouthDischargeTopbarAlert(
  referenceDate = getKoreanDateValue(),
): Promise<YouthDischargeTopbarAlert | null> {
  const youths = await prisma.youth.findMany({
    where: {
      dischargeDate: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      dischargeDate: true,
    },
  });

  return createYouthDischargeTopbarAlert(youths, referenceDate);
}
