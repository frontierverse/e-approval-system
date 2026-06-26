import "server-only";

import { UserRole, UserStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { appName, organizationName } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import {
  getYouthDisplayAge,
  getYouthLearningScheduleToday,
} from "@/lib/youth-management-core";

export type CompanyInfoData = {
  business: {
    activeDepartmentCount: number;
    activeStaffCount: number;
    admittedYouthCount: number;
    appName: string;
    businesses: CompanyInfoBusiness[];
    canManageBusinessInfo: boolean;
    referenceDate: string;
  };
  staff: CompanyInfoStaffMember[];
  admittedYouths: CompanyInfoAdmittedYouth[];
};

export type CompanyInfoBusiness = {
  id: string;
  address: string | null;
  name: string;
  registrationNumber: string | null;
  representative: CompanyInfoRepresentative | null;
};

export type CompanyInfoRepresentative = {
  id: string;
  name: string;
};

export type CompanyInfoStaffMember = {
  id: string;
  name: string;
  email: string | null;
  birthDate: string | null;
  hireDate: string | null;
  departmentName: string;
  positionName: string;
  profileImageStorageKey: string | null;
  profileImageUpdatedAt: string | null;
};

export type CompanyInfoAdmittedYouth = {
  id: string;
  name: string;
  admissionDate: string | null;
  birthDate: string | null;
  dischargeDate: string | null;
  age: number | null;
  phone: string | null;
};

const representativeLookupName = "안윤숙";
const companyBusinessDefinitions = [
  {
    id: "youth-self-reliance-school",
    name: organizationName,
  },
  {
    id: "bajaul-youth-recovery-support-facility",
    name: "바자울 청소년회복지원시설",
  },
] as const;

export type CompanyBusinessId = (typeof companyBusinessDefinitions)[number]["id"];

export async function getCompanyInfo(): Promise<CompanyInfoData> {
  const user = await requireUser();

  const referenceDate = getYouthLearningScheduleToday();
  const [
    staff,
    admittedYouths,
    activeDepartmentCount,
    representative,
    businessInfoRows,
  ] = await Promise.all([
      getActiveStaffMembers(referenceDate),
      getAdmittedYouths(referenceDate),
      prisma.department.count({
        where: {
          isActive: true,
        },
      }),
      getCompanyRepresentative(),
      getCompanyBusinessInfoRows(),
    ]);

  return {
    business: {
      activeDepartmentCount,
      activeStaffCount: staff.length,
      admittedYouthCount: admittedYouths.length,
      appName,
      businesses: createCompanyBusinesses(representative, businessInfoRows),
      canManageBusinessInfo: user.role === UserRole.ADMIN,
      referenceDate,
    },
    staff,
    admittedYouths,
  };
}

async function getCompanyRepresentative() {
  const representativeRecord = await prisma.user.findFirst({
    where: {
      name: representativeLookupName,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  if (!representativeRecord) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      id: representativeRecord.id,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

function createCompanyBusinesses(
  representative: CompanyInfoRepresentative | null,
  businessInfoRows: CompanyBusinessInfoRow[],
): CompanyInfoBusiness[] {
  const businessInfoById = new Map(
    businessInfoRows.map((row) => [row.id, row]),
  );

  return companyBusinessDefinitions.map((business) => {
    const businessInfo = businessInfoById.get(business.id);

    return {
      id: business.id,
      address: businessInfo?.address ?? null,
      name: business.name,
      registrationNumber: businessInfo?.registrationNumber ?? null,
      representative,
    };
  });
}

type CompanyBusinessInfoRow = Awaited<
  ReturnType<typeof getCompanyBusinessInfoRows>
>[number];

async function getCompanyBusinessInfoRows() {
  return prisma.companyBusinessInfo.findMany({
    where: {
      id: {
        in: companyBusinessDefinitions.map((business) => business.id),
      },
    },
    select: {
      id: true,
      address: true,
      registrationNumber: true,
    },
  });
}

export function isCompanyBusinessId(value: string): value is CompanyBusinessId {
  return companyBusinessDefinitions.some((business) => business.id === value);
}

export function getCompanyBusinessName(businessId: CompanyBusinessId) {
  return (
    companyBusinessDefinitions.find((business) => business.id === businessId)
      ?.name ?? businessId
  );
}

async function getActiveStaffMembers(referenceDate: string) {
  const users = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
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
      email: true,
      birthDate: true,
      hireDate: true,
      profileImageStorageKey: true,
      profileImageUpdatedAt: true,
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
    orderBy: [
      {
        department: {
          sortOrder: "asc",
        },
      },
      {
        position: {
          level: "desc",
        },
      },
      {
        name: "asc",
      },
    ],
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    birthDate: user.birthDate,
    hireDate: user.hireDate,
    departmentName: user.department.name,
    positionName: user.position.name,
    profileImageStorageKey: user.profileImageStorageKey,
    profileImageUpdatedAt: user.profileImageUpdatedAt?.toISOString() ?? null,
  }));
}

async function getAdmittedYouths(referenceDate: string) {
  const youths = await prisma.youth.findMany({
    where: {
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
      admissionDate: true,
      dischargeDate: true,
      age: true,
      birthDate: true,
      phone: true,
    },
    orderBy: [
      {
        admissionDate: "asc",
      },
      {
        name: "asc",
      },
    ],
  });

  return youths.map((youth) => ({
    id: youth.id,
    name: youth.name,
    admissionDate: youth.admissionDate,
    birthDate: youth.birthDate,
    dischargeDate: youth.dischargeDate,
    age: getYouthDisplayAge(
      {
        age: youth.age,
        birthDate: youth.birthDate,
      },
      referenceDate,
    ),
    phone: youth.phone,
  }));
}
