"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
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
  await requireAdmin();

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

  await saveCompanyBusinessInfo(businessId, values);
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
