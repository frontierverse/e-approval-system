"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { CafeItemEditModal } from "@/components/cafe-item-row-actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatCafeItemDate,
  getCafeItemCategoryLabel,
  getCafeItemUsageDday,
  type CafeItem,
} from "@/lib/cafe-items-core";

export function CafeItemRow({ item, today }: { item: CafeItem; today: string }) {
  const usageDday = getCafeItemUsageDday(item, today);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);

  function openEditModal() {
    setModalKey((currentKey) => currentKey + 1);
    setIsEditOpen(true);
  }

  function closeEditModal() {
    setIsEditOpen(false);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if (isInteractiveElement(event.target, event.currentTarget)) {
      return;
    }

    openEditModal();
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      openEditModal();
    }
  }

  return (
    <tr
      aria-label={`${item.name} 물품 수정`}
      className="cursor-pointer align-top transition hover:bg-[#fbfcfd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#196b69]"
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role="button"
      tabIndex={0}
    >
      <td className="w-[12rem] max-w-[12rem] px-6 py-5">
        <p className="break-words font-semibold text-[#16181d] [overflow-wrap:anywhere]">
          {item.name}
        </p>
        <p className="mt-2 text-xs text-[#9aa4b2]">
          등록 {formatDateTime(item.createdAt)}
        </p>
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {formatCafeItemDate(item.purchasedAt)}
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {getCafeItemCategoryLabel(item.category)}
      </td>
      <td className="px-6 py-5">
        <span
          className={[
            "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
            getUsageDdayClassName(usageDday.status),
          ].join(" ")}
        >
          {usageDday.label}
        </span>
        {usageDday.basisLabel === "유통기한 기준" ? null : (
          <p className="mt-2 text-xs leading-5 text-[#697386]">
            {usageDday.basisLabel}
          </p>
        )}
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {item.category === "food"
          ? formatCafeItemDate(item.expirationDate)
          : "해당 없음"}
      </td>
      <td className="px-6 py-5 leading-6 text-[#394150]">
        {formatPrice(item.priceWon)}
      </td>
      <td className="w-[6rem] max-w-[6rem] px-6 py-5">
        <p className="whitespace-pre-line break-words leading-6 text-[#394150] [overflow-wrap:anywhere]">
          {item.purchaseReason || "미입력"}
        </p>
      </td>
      <td className="w-[10rem] px-6 py-5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openEditModal();
          }}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-9 px-3 text-xs",
          )}
        >
          편집
        </button>

        {isEditOpen ? (
          <CafeItemEditModal
            key={modalKey}
            item={item}
            onClose={closeEditModal}
          />
        ) : null}
      </td>
    </tr>
  );
}

function isInteractiveElement(
  target: EventTarget | null,
  row: HTMLTableRowElement,
) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactiveElement = target.closest(
    "a,button,input,select,textarea,label,[role='button'],[data-row-click-ignore='true']",
  );

  return Boolean(interactiveElement && interactiveElement !== row);
}

function getUsageDdayClassName(
  status: ReturnType<typeof getCafeItemUsageDday>["status"],
) {
  if (status === "expired") {
    return "border-[#efb4b4] bg-[#fff1f1] text-[#a13a3a]";
  }

  if (status === "soon") {
    return "border-[#f0d28a] bg-[#fff8e8] text-[#7a5200]";
  }

  if (status === "safe") {
    return "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]";
  }

  return "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]";
}

function formatPrice(value: number | null) {
  if (value === null) {
    return "미입력";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
