"use client";

import { useActionState } from "react";
import {
  updateCompanyBusinessInfoAction,
  type CompanyBusinessInfoFormState,
} from "@/app/company-info/actions";
import {
  AdminEditModal,
  FormMessage,
  TextField,
} from "@/components/admin-form-controls";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { CompanyInfoBusiness } from "@/lib/company-info";

const initialState: CompanyBusinessInfoFormState = {};

export function CompanyBusinessInfoEditModal({
  business,
}: {
  business: CompanyInfoBusiness;
}) {
  return (
    <AdminEditModal
      title="사업자 정보 수정"
      description={business.name}
      trigger={
        <span className="inline-flex items-center">
          <span aria-hidden="true">✎</span>
          <span className="sr-only">{business.name} 사업자 정보 수정</span>
        </span>
      }
      triggerClassName="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#cfd6e3] bg-white text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
      dialogClassName="max-w-xl"
    >
      <CompanyBusinessInfoForm business={business} />
    </AdminEditModal>
  );
}

function CompanyBusinessInfoForm({
  business,
}: {
  business: CompanyInfoBusiness;
}) {
  const updateBusinessInfo = updateCompanyBusinessInfoAction.bind(
    null,
    business.id,
  );
  const [state, formAction, pending] = useActionState(
    updateBusinessInfo,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <TextField
        label="사업자등록번호"
        name="registrationNumber"
        defaultValue={
          state.values?.registrationNumber ?? business.registrationNumber ?? ""
        }
        placeholder="예: 000-00-00000"
      />
      <TextField
        label="소재지"
        name="address"
        defaultValue={state.values?.address ?? business.address ?? ""}
        placeholder="사업장 소재지"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.save,
            "h-10 px-4 text-sm",
          )}
        >
          {pending ? "저장 중" : "저장"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
