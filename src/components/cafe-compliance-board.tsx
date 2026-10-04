"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  createCafeComplianceNoteAction,
  deleteCafeComplianceNoteAction,
  getCafeNoteEditorAction,
} from "@/app/work-schedule/cafe/actions";
import { useCafeMutation } from "@/components/use-cafe-mutation";
import { CafeMutationFeedback, CafeMutationHidden } from "@/components/cafe-mutation-feedback";
import type { MobileCafeNote } from "@/lib/mobile-cafe-core";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeComplianceNoteMaxLength,
  createCafeCompliancePageHref,
  type CafeComplianceNoteFormState,
  type CafeComplianceNotePage,
} from "@/lib/cafe-compliance-notes-core";
import { formatDateTime } from "@/lib/mock-data";


export function CafeComplianceNoteForm({ actorId = "" }: { actorId?: string }) {
  const mutation = useCafeMutation(createCafeComplianceNoteAction, { actorId, operation: "note.create" });
  const { state, formAction, pending } = mutation;
  if (mutation.erased) return <CafeMutationFeedback state={{ error: mutation.state.error ?? "로그인 계정이 변경되었습니다. 카페 관리를 다시 열어 주세요." }} />;

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5 shadow-sm">
      <form key={state.resetKey ?? "draft"} action={formAction} onSubmit={mutation.onSubmit}>
        <CafeMutationHidden mutation={mutation} />
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
            disabled={pending || mutation.unknown}
            name="content"
            required
            maxLength={cafeComplianceNoteMaxLength}
            defaultValue={(state as CafeComplianceNoteFormState).values?.content ?? ""}
            placeholder="예: 마감 시 에스프레소 머신 청소 후 전원을 차단합니다."
            className="mt-2 min-h-28 w-full resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
        </label>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={pending || mutation.unknown}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-11 px-4 text-sm",
            )}
          >
            {pending ? "등록 중" : "등록"}
          </button>
        </div>
        {mutation.unknown ? <button type="submit" disabled={pending} className="min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">같은 요청 결과 확인</button> : null}
      </form>

      <CafeComplianceNoteFormMessage state={state} />
    </section>
  );
}

function CafeComplianceNoteFormMessage({ state }: { state: CafeComplianceNoteFormState }) { return <CafeMutationFeedback state={state} />; }

export function CafeComplianceNoteList({
  notePage, actorId = "",
}: {
  notePage: CafeComplianceNotePage;
  actorId?: string;
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
                  <CafeNoteDeleteForm note={note} actorId={actorId} />
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
      <span className="inline-flex h-11 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
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
        "h-11 px-4 text-sm",
      )}
    >
      {children}
    </Link>
  );
}

function CafeNoteDeleteForm({ note, actorId }: { note: MobileCafeNote; actorId: string }) {
  const mutation = useCafeMutation(deleteCafeComplianceNoteAction.bind(null, note.id), { actorId, operation: "note.delete", targetId: note.id, expectedUpdatedAt: note.updatedAt });
  const [fresh, setFresh] = useState<MobileCafeNote | null>(null), [error, setError] = useState("");
  const mounted = useRef(true); const currentActor = useRef(actorId); useLayoutEffect(() => { currentActor.current = actorId; }, [actorId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // The deletion component's lifetime is guarded by its mutation hook; no parent dispatch after unmount.
  async function loadFresh() { const actor = actorId; if (!mutation.claim()) return; try { const response = await getCafeNoteEditorAction(note.id, actor); if (!mounted.current || currentActor.current !== actor) return; if (response.ok) { if (response.data.id !== note.id || !Number.isFinite(new Date(response.data.updatedAt).getTime()) || new Date(response.data.updatedAt).toISOString() !== response.data.updatedAt) throw new Error("INVALID_EDITOR"); setFresh(response.data); setError(""); } else if ([401,403].includes(response.status)) mutation.clearPrivate(response.error); else setError(response.error); } catch { if (mounted.current) setError("최신 준수사항을 확인하지 못했습니다."); } finally { mutation.release(); } }
  if (mutation.erased) return <CafeMutationFeedback state={{ error: mutation.state.error ?? "로그인 계정이 변경되었습니다. 카페 관리를 다시 열어 주세요." }} />;
  return <div className="min-w-0"><form action={mutation.formAction} onSubmit={mutation.onSubmit}><CafeMutationHidden mutation={mutation} /><ConfirmSubmitButton message="이 준수사항을 삭제하시겠습니까? 삭제하면 복구할 수 없습니다." type="submit" disabled={mutation.pending || mutation.conflict} className={buttonClass(buttonStyles.base, buttonStyles.dangerOutline, "min-h-11 px-3 text-xs")}>{mutation.pending ? "확인 중" : mutation.unknown ? "같은 삭제 요청 확인" : "삭제"}</ConfirmSubmitButton></form><CafeMutationFeedback state={mutation.state} />{mutation.conflict ? <><button type="button" onClick={loadFresh} disabled={mutation.pending} className="min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">최신 준수사항 확인</button>{fresh ? <div><p className="whitespace-pre-wrap break-words text-sm">{fresh.content}</p><button type="button" onClick={() => { if (mutation.adoptBaseline(fresh.updatedAt)) setFresh(null); }} className="min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">최신 기준 사용</button></div> : null}<p role="alert">{error}</p></> : null}</div>;
}
