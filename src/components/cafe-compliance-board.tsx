"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createCafeComplianceNoteAction,
  deleteCafeComplianceNoteAction,
} from "@/app/work-schedule/cafe/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeComplianceNoteMaxLength,
  createCafeCompliancePageHref,
  type CafeComplianceNoteFormState,
  type CafeComplianceNotePage,
} from "@/lib/cafe-compliance-notes-core";
import { formatDateTime } from "@/lib/mock-data";

const initialFormState: CafeComplianceNoteFormState = {};

export function CafeComplianceNoteForm() {
  const [state, formAction, pending] = useActionState(
    createCafeComplianceNoteAction,
    initialFormState,
  );

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5 shadow-sm">
      <form key={state.resetKey ?? "draft"} action={formAction}>
        <div className="border-b border-[#eef1f5] pb-4">
          <h2 className="text-base font-semibold text-[#16181d]">
            준수사항 입력
          </h2>
          <p className="mt-1 text-sm text-[#697386]">
            카페 운영 시 함께 지켜야 할 내용을 기록합니다.
          </p>
        </div>

        <label className="mt-5 block min-w-0">
          <span className="block text-xs font-semibold leading-4 text-[#697386]">
            준수사항 내용
          </span>
          <textarea
            name="content"
            required
            maxLength={cafeComplianceNoteMaxLength}
            defaultValue={state.values?.content ?? ""}
            placeholder="예: 마감 시 에스프레소 머신 청소 후 전원을 차단합니다."
            className="mt-2 min-h-28 w-full resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
        </label>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 px-4 text-sm",
            )}
          >
            {pending ? "등록 중" : "등록"}
          </button>
        </div>
      </form>

      <CafeComplianceNoteFormMessage state={state} />
    </section>
  );
}

function CafeComplianceNoteFormMessage({
  state,
}: {
  state: CafeComplianceNoteFormState;
}) {
  if (state.error) {
    return (
      <p className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p className="mt-3 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a]">
        {state.success}
      </p>
    );
  }

  return null;
}

export function CafeComplianceNoteList({
  notePage,
}: {
  notePage: CafeComplianceNotePage;
}) {
  const firstItem =
    notePage.total === 0 ? 0 : (notePage.page - 1) * notePage.pageSize + 1;
  const lastItem = Math.min(notePage.page * notePage.pageSize, notePage.total);

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white shadow-sm">
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-base font-semibold text-[#16181d]">
          준수사항 목록
        </h2>
        <p className="mt-1 text-sm text-[#697386]">
          {notePage.total > 0
            ? `${notePage.total}건 중 ${firstItem}-${lastItem}건 표시`
            : "등록된 준수사항이 없습니다."}
        </p>
      </div>

      {notePage.notes.length > 0 ? (
        <ol className="divide-y divide-[#eef1f5]">
          {notePage.notes.map((note, index) => (
            <li key={note.id} className="flex gap-4 px-5 py-4">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eef7f6] text-xs font-semibold text-[#196b69]"
              >
                {firstItem + index}
              </span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#394150] [overflow-wrap:anywhere]">
                  {note.content}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[#697386]">
                    {note.createdBy ? `${note.createdBy.name} · ` : ""}
                    <time dateTime={note.createdAt}>
                      {formatDateTime(note.createdAt)}
                    </time>
                  </p>
                  <form
                    action={deleteCafeComplianceNoteAction.bind(null, note.id)}
                  >
                    <ConfirmSubmitButton
                      message="이 준수사항을 삭제하시겠습니까?"
                      type="submit"
                      className={buttonClass(
                        buttonStyles.base,
                        buttonStyles.dangerOutline,
                        "h-8 px-3 text-xs",
                      )}
                    >
                      삭제
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          아직 등록된 준수사항이 없습니다. 위 입력란에 첫 준수사항을
          등록해 보세요.
        </p>
      )}

      <CafeComplianceNotePagination notePage={notePage} />
    </section>
  );
}

function CafeComplianceNotePagination({
  notePage,
}: {
  notePage: CafeComplianceNotePage;
}) {
  if (notePage.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="준수사항 목록 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4"
    >
      <p className="text-sm text-[#697386]">
        {notePage.page} / {notePage.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <CafeCompliancePaginationLink
          disabled={notePage.page <= 1}
          page={notePage.page - 1}
        >
          이전
        </CafeCompliancePaginationLink>
        <CafeCompliancePaginationLink
          disabled={notePage.page >= notePage.totalPages}
          page={notePage.page + 1}
        >
          다음
        </CafeCompliancePaginationLink>
      </div>
    </nav>
  );
}

function CafeCompliancePaginationLink({
  children,
  disabled,
  page,
}: {
  children: React.ReactNode;
  disabled: boolean;
  page: number;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={createCafeCompliancePageHref(page)}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "h-10 px-4 text-sm",
      )}
    >
      {children}
    </Link>
  );
}
