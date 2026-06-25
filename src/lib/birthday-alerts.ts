import "server-only";

import { UserStatus } from "@/generated/prisma/client";
import {
  createBirthdayTopbarAlert,
  type BirthdayAlertPerson,
  type BirthdayTopbarAlert,
} from "@/lib/birthday-alerts-core";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { prisma } from "@/lib/prisma";

export async function getBirthdayTopbarAlert(
  referenceDate = getKoreanDateValue(),
): Promise<BirthdayTopbarAlert | null> {
  const [staff, youths] = await Promise.all([
    getBirthdayAlertStaff(referenceDate),
    getBirthdayAlertYouths(referenceDate),
  ]);

  return createBirthdayTopbarAlert([...staff, ...youths], referenceDate);
}

async function getBirthdayAlertStaff(
  referenceDate: string,
): Promise<BirthdayAlertPerson[]> {
  const users = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      birthDate: {
        not: null,
      },
      OR: [
        {
          resignationDate: null,
        },
        {
          resignationDate: "",
        },
        {
          resignationDate: {
            gte: referenceDate,
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      birthDate: true,
      department: {
        select: {
          name: true,
        },
      },
      position: {
        select: {
          name: true,
        },
      },
    },
  });

  return users.map((user) => ({
    birthDate: normalizeBlank(user.birthDate),
    detailLabel: `${user.department.name} / ${user.position.name}`,
    id: user.id,
    kind: "staff",
    name: user.name,
  }));
}

async function getBirthdayAlertYouths(
  referenceDate: string,
): Promise<BirthdayAlertPerson[]> {
  const youths = await prisma.youth.findMany({
    where: {
      birthDate: {
        not: null,
      },
      OR: [
        {
          dischargeDate: null,
        },
        {
          dischargeDate: "",
        },
        {
          dischargeDate: {
            gte: referenceDate,
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      birthDate: true,
    },
  });

  return youths.map((youth) => ({
    birthDate: normalizeBlank(youth.birthDate),
    detailLabel: "입소중 청소년",
    id: youth.id,
    kind: "youth",
    name: youth.name,
  }));
}

function normalizeBlank(value: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}
