"use client";

import { useActionState, useState } from "react";
import {
  createWorkFeatureUpdateAction,
  type WorkFeatureUpdateFormState,
} from "@/app/work-feature-updates/actions";
import { AppModal } from "@/components/app-modal";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { SystemUsageSummary } from "@/lib/system-usage";
import type { WorkFeatureUpdate } from "@/lib/work-feature-updates";

const initialFeatureUpdateFormState: WorkFeatureUpdateFormState = {};

export function WorkFeatureUpdateList({
  avoidTopRightSlot = false,
  canCreate,
  usageSummary,
  updates,
}: {
  avoidTopRightSlot?: boolean;
  canCreate: boolean;
  usageSummary?: SystemUsageSummary;
  updates: WorkFeatureUpdate[];
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createWorkFeatureUpdateAction,
    initialFeatureUpdateFormState,
  );

  return (
    <section
      aria-label="추가된 기능 내역"
      className={buttonClass(
        "overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm",
        avoidTopRightSlot ? "home-feature-card" : "",
      )}
    >
      <div
        className={buttonClass(
          "flex min-w-0 items-start justify-between gap-3 border-b border-[#eef1f5] px-5 py-4",
          avoidTopRightSlot ? "home-feature-card-header" : "",
        )}
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#16181d]">
            추가된 기능 내역
          </h2>
          <p className="mt-1 text-sm text-[#697386]">
            최근 업무 관리에 반영된 기능을 3개까지 보여줍니다.
          </p>
          {usageSummary ? (
            <SystemUsageSummaryInline usageSummary={usageSummary} />
          ) : null}
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-9 shrink-0 gap-1.5 px-3 text-sm",
            )}
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            추가
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-[#eef1f5]">
        {updates.length > 0 ? (
          updates.slice(0, 3).map((update) => (
            <article
              key={update.id}
              className="grid min-h-14 min-w-0 gap-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
            >
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[#16181d]">
                  {update.title}
                </h3>
                {update.description ? (
                  <p className="mt-1 truncate text-sm text-[#697386]">
                    {update.description}
                  </p>
                ) : null}
              </div>
              <p className="text-xs font-medium text-[#697386] sm:text-right">
                {formatFeatureUpdateDate(update.createdAt)}
              </p>
            </article>
          ))
        ) : (
          <p className="px-5 py-5 text-sm text-[#697386]">
            등록된 기능 내역이 없습니다.
          </p>
        )}
      </div>

      {isModalOpen && canCreate ? (
        <AppModal
          className="max-w-lg"
          labelledBy="work-feature-update-modal-title"
          onClose={() => setIsModalOpen(false)}
        >
          <form action={formAction}>
            <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-[#196b69]">
                  관리자 전용
                </p>
                <h2
                  id="work-feature-update-modal-title"
                  className="mt-1 text-xl font-semibold leading-tight text-[#16181d]"
                >
                  기능 내역 추가
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                닫기
              </button>
            </div>

            <div className="grid gap-4 px-5 py-5">
              <label className="block min-w-0">
                <span className="block text-xs font-semibold text-[#697386]">
                  기능명
                  <span aria-hidden="true" className="ml-1 text-[#c62828]">
                    *
                  </span>
                  <span className="sr-only">필수</span>
                </span>
                <input
                  name="title"
                  required
                  maxLength={100}
                  defaultValue={state.values?.title ?? ""}
                  placeholder="예: 냉장고 관리 메뉴 추가"
                  className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </label>

              <label className="block min-w-0">
                <span className="block text-xs font-semibold text-[#697386]">
                  설명
                  <span className="ml-1 font-normal text-[#9aa4b2]">(선택)</span>
                </span>
                <textarea
                  name="description"
                  maxLength={500}
                  defaultValue={state.values?.description ?? ""}
                  placeholder="기능 변경 내용을 짧게 적어 주세요."
                  className="mt-2 min-h-24 w-full resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </label>

              {state.error ? (
                <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                  {state.error}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#eef1f5] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.neutral,
                  "h-10 px-4 text-sm",
                )}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.create,
                  "h-10 px-4 text-sm",
                )}
              >
                {pending ? "추가 중" : "추가"}
              </button>
            </div>
          </form>
        </AppModal>
      ) : null}
    </section>
  );
}

function SystemUsageSummaryInline({
  usageSummary,
}: {
  usageSummary: SystemUsageSummary;
}) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#697386]">
      {[usageSummary.database, usageSummary.storage].map((metric) => (
        <div key={metric.label} className="min-w-32">
          <div className="flex items-baseline gap-1.5">
            <dt className="font-semibold text-[#394150]">{metric.label}</dt>
            <dd className="font-medium">
              {metric.usedLabel} / {metric.limitLabel}
            </dd>
          </div>
          <div
            className="mt-1 h-1 overflow-hidden rounded-full bg-[#edf1f5]"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-[#196b69]"
              style={{ width: `${metric.usedPercent}%` }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}

function formatFeatureUpdateDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
