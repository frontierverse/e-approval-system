"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireAdmin } from "@/lib/auth";
import {
  getCompanyBusinessName,
  isCompanyBusinessId,
  type CompanyBusinessId,
} from "@/lib/company-info";
import { prisma } from "@/lib/prisma";

export type CompanyBusinessInfoFormState = {
  error?: string;
  success?: string;
  values?: {
    address: string;
    registrationNumber: string;
  };
};

const companyInfoPath = "/company-info";
const maxRegistrationNumberLength = 60;
const maxAddressLength = 200;

export async function updateCompanyBusinessInfoAction(
  businessId: string,
  _previousState: CompanyBusinessInfoFormState,
  formData: FormData,
): Promise<CompanyBusinessInfoFormState> {
  const admin = await requireAdmin();

  if (!isCompanyBusinessId(businessId)) {
    return {
      error: "수정할 사업자 정보를 찾을 수 없습니다.",
    };
  }

  const values = getCompanyBusinessInfoFormValues(formData);
  const validationError = validateCompanyBusinessInfoFormValues(values);

  if (validationError) {
    return {
      error: validationError,
      values,
    };
  }

  const before = await prisma.companyBusinessInfo.findUnique({
    where: {
      id: businessId,
    },
    select: {
      address: true,
      registrationNumber: true,
    },
  });
  const after = {
    address: values.address || null,
    registrationNumber: values.registrationNumber || null,
  };
  const auditChanges = createCompanyBusinessInfoAuditChanges({
    after,
    before,
  });
  const auditRequestData = await getCurrentAuditLogRequestData();

  await prisma.$transaction([
    saveCompanyBusinessInfo(businessId, values),
    prisma.auditLog.create({
      data: {
        actorId: admin.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_COMPANY_INFO,
        targetType: "CompanyBusinessInfo",
        targetId: businessId,
        message: `${getCompanyBusinessName(businessId)} 회사 정보를 수정했습니다.`,
        metadata:
          auditChanges.length > 0
            ? {
                changes: auditChanges,
              }
            : undefined,
      },
    }),
  ]);
  revalidatePath(companyInfoPath);

  return {
    success: "사업자 정보를 저장했습니다.",
    values,
  };
}

function getCompanyBusinessInfoFormValues(formData: FormData) {
  return {
    address: normalizeText(formData.get("address")),
    registrationNumber: normalizeText(formData.get("registrationNumber")),
  };
}

function validateCompanyBusinessInfoFormValues({
  address,
  registrationNumber,
}: {
  address: string;
  registrationNumber: string;
}) {
  if (registrationNumber.length > maxRegistrationNumberLength) {
    return `사업자등록번호는 ${maxRegistrationNumberLength}자 이하로 입력하세요.`;
  }

  if (address.length > maxAddressLength) {
    return `소재지는 ${maxAddressLength}자 이하로 입력하세요.`;
  }

  return null;
}

function createCompanyBusinessInfoAuditChanges({
  after,
  before,
}: {
  after: {
    address: string | null;
    registrationNumber: string | null;
  };
  before: {
    address: string | null;
    registrationNumber: string | null;
  } | null;
}) {
  const changes: Array<{
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }> = [];
  const previous = before ?? {
    address: null,
    registrationNumber: null,
  };

  pushAuditChange(
    changes,
    "registrationNumber",
    "사업자등록번호",
    previous.registrationNumber,
    after.registrationNumber,
  );
  pushAuditChange(changes, "address", "소재지", previous.address, after.address);

  return changes;
}

function pushAuditChange(
  changes: Array<{
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }>,
  field: string,
  label: string,
  before: string | null,
  after: string | null,
) {
  if (before === after) {
    return;
  }

  changes.push({
    field,
    label,
    before,
    after,
  });
}

function saveCompanyBusinessInfo(
  businessId: CompanyBusinessId,
  {
    address,
    registrationNumber,
  }: {
    address: string;
    registrationNumber: string;
  },
) {
  return prisma.companyBusinessInfo.upsert({
    where: {
      id: businessId,
    },
    create: {
      id: businessId,
      address: address || null,
      registrationNumber: registrationNumber || null,
    },
    update: {
      address: address || null,
      registrationNumber: registrationNumber || null,
    },
  });
}

function normalizeText(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
