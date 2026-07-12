"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { AppModal } from "@/components/app-modal";
import {
  formatBirthdayAlertDate,
  formatBirthdayAlertDateWithWeekday,
} from "@/lib/birthday-alerts-core";
import { formatYouthDischargeAlertDateWithWeekday } from "@/lib/youth-discharge-alerts-core";
import { createCafeItemExpiringFoodPrintHref } from "@/lib/cafe-items-core";
import {
  createCurrentCommonScheduleAlert,
  type CurrentCommonScheduleAlert,
  type CurrentCommonScheduleSource,
} from "@/lib/current-common-schedule-core";
import {
  createRefrigeratorFoodExpirationAlert,
  readRefrigeratorItemsFromStorage,
  refrigeratorItemsStorageEventName,
  refrigeratorItemsStorageKey,
  type RefrigeratorFoodExpirationAlert,
  type RefrigeratorFoodExpirationAlertItem,
} from "@/lib/refrigerator-items-core";

export type NavigationItem = {
  label: string;
  href: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
  align?: "end";
};

export type NavigationTopbarAlert = {
  ddayLabel: string;
  href: string;
  itemName: string;
  items: NavigationTopbarAlertItem[];
  label: string;
  status?: "active" | "empty";
};

export type NavigationTopbarAlertItem = {
  ddayLabel: string;
  expirationDate: string;
  href: string;
  id: string;
  itemName: string;
};

export type NavigationTopbarFoodExpirationAlert =
  RefrigeratorFoodExpirationAlert & {
    label: string;
    status?: "active" | "empty";
  };

export type NavigationTopbarFoodExpirationAlertItem =
  RefrigeratorFoodExpirationAlertItem;

export type NavigationTopbarBirthdayAlert = {
  ddayLabel: string;
  items: NavigationTopbarBirthdayAlertItem[];
  label: string;
  personName: string;
  status?: "active" | "empty";
};

export type NavigationTopbarBirthdayAlertItem = {
  birthdayDate: string;
  birthDate: string;
  ddayLabel: string;
  detailLabel: string;
  id: string;
  name: string;
  typeLabel: string;
};

export type NavigationTopbarVacationAlert = {
  ddayLabel: string;
  items: NavigationTopbarVacationAlertItem[];
  label: string;
  staffName: string;
  status?: "active" | "empty";
};

export type NavigationTopbarVacationAlertItem = {
  date: string;
  ddayLabel: string;
  detailLabel: string;
  id: string;
  staffName: string;
  vacationLabel: string;
  workScheduleHref: string;
};

export type NavigationTopbarDischargeAlert = {
  ddayLabel: string;
  items: NavigationTopbarDischargeAlertItem[];
  label: string;
  status?: "active" | "empty";
  youthName: string;
};

export type NavigationTopbarDischargeAlertItem = {
  daysUntil: number;
  ddayLabel: string;
  dischargeDate: string;
  id: string;
  name: string;
  rosterHref: string;
};

export type NavigationTopbarCurrentScheduleAlert = CurrentCommonScheduleAlert & {
  href: string;
  label: string;
  status?: "active" | "empty";
};

export type NavigationTopbarCurrentScheduleItem = CurrentCommonScheduleSource;

type AppNavProps = {
  groups: NavigationGroup[];
  topbarAlert?: NavigationTopbarAlert | null;
  topbarBirthdayAlert?: NavigationTopbarBirthdayAlert | null;
  topbarCurrentScheduleAlert?: NavigationTopbarCurrentScheduleAlert | null;
  topbarCurrentScheduleItems?: NavigationTopbarCurrentScheduleItem[];
  topbarDischargeAlert?: NavigationTopbarDischargeAlert | null;
  topbarVacationAlert?: NavigationTopbarVacationAlert | null;
  variant: "mobile" | "desktop" | "topbar";
};

type MobileDragState = {
  pointerId: number | null;
  startX: number;
  scrollLeft: number;
  moved: boolean;
  suppressClick: boolean;
};

const emptyCurrentScheduleItems: NavigationTopbarCurrentScheduleItem[] = [];

export function AppNav({
  groups,
  topbarAlert = null,
  topbarBirthdayAlert = null,
  topbarCurrentScheduleAlert = null,
  topbarCurrentScheduleItems = emptyCurrentScheduleItems,
  topbarDischargeAlert = null,
  topbarVacationAlert = null,
  variant,
}: AppNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = getCurrentHref(pathname, searchParams);
  const mobileNavRef = useRef<HTMLElement>(null);
  const selectedGroup = getActiveGroup(groups, pathname, currentHref) ?? groups[0];
  const selectedItems = selectedGroup?.items ?? [];
  const firstEndAlignedGroupIndex = groups.findIndex(
    (group) => group.align === "end",
  );
  const currentScheduleAlert = useCurrentScheduleAlert({
    enabled: variant === "topbar",
    initialAlert: topbarCurrentScheduleAlert,
    schedules: topbarCurrentScheduleItems,
  });
  const hasTopbarWidgets = Boolean(
    currentScheduleAlert ||
      topbarBirthdayAlert ||
      topbarDischargeAlert ||
      topbarVacationAlert ||
      topbarAlert,
  );
  const dragStateRef = useRef<MobileDragState>({
    pointerId: null,
    startX: 0,
    scrollLeft: 0,
    moved: false,
    suppressClick: false,
  });

  useEffect(() => {
    if (variant !== "mobile") {
      return;
    }

    const nav = mobileNavRef.current;
    const activeLink = nav?.querySelector<HTMLElement>('[data-active-nav="true"]');

    if (!nav || !activeLink) {
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const activeLinkRect = activeLink.getBoundingClientRect();
    const centeredScrollLeft =
      nav.scrollLeft +
      activeLinkRect.left -
      navRect.left -
      (nav.clientWidth - activeLinkRect.width) / 2;
    const maxScrollLeft = nav.scrollWidth - nav.clientWidth;

    nav.scrollTo({
      left: Math.max(0, Math.min(centeredScrollLeft, maxScrollLeft)),
      behavior: "auto",
    });
  }, [currentHref, variant]);

  function handleMobileNavPointerDown(event: PointerEvent<HTMLElement>) {
    if (
      variant !== "mobile" ||
      event.button !== 0 ||
      event.pointerType === "touch"
    ) {
      return;
    }

    const nav = event.currentTarget;

    if (nav.scrollWidth <= nav.clientWidth) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: nav.scrollLeft,
      moved: false,
      suppressClick: false,
    };
  }

  function handleMobileNavPointerMove(event: PointerEvent<HTMLElement>) {
    const state = dragStateRef.current;

    if (variant !== "mobile" || state.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - state.startX;

    if (Math.abs(deltaX) > 12) {
      state.moved = true;
      state.suppressClick = true;

      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (state.moved) {
      event.preventDefault();
      event.currentTarget.scrollLeft = state.scrollLeft - deltaX;
    }
  }

  function handleMobileNavPointerEnd(event: PointerEvent<HTMLElement>) {
    const state = dragStateRef.current;

    if (state.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    state.pointerId = null;
    state.moved = false;

    if (state.suppressClick) {
      window.setTimeout(() => {
        dragStateRef.current.suppressClick = false;
      }, 120);
    }
  }

  function handleMobileNavClickCapture(event: MouseEvent<HTMLElement>) {
    if (!dragStateRef.current.suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current.suppressClick = false;
  }

  if (variant === "topbar") {
    return (
      <div className="relative w-full max-w-full overflow-hidden">
        <nav
          aria-label="상위 메뉴"
          className="scrollbar-none flex h-[3.25rem] w-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-t border-[#eef1f5] px-3 py-2 scroll-px-3 sm:gap-2 sm:px-6 sm:scroll-px-6 lg:px-8 lg:scroll-px-8"
        >
          {groups.map((group, index) => (
            <Fragment key={group.label}>
              {index === firstEndAlignedGroupIndex ? (
                <TopbarWidgetGroup
                  birthdayAlert={topbarBirthdayAlert}
                  currentScheduleAlert={currentScheduleAlert}
                  dischargeAlert={topbarDischargeAlert}
                  expirationAlert={topbarAlert}
                  vacationAlert={topbarVacationAlert}
                />
              ) : null}
              <CategoryLink
                group={group}
                active={group.label === selectedGroup?.label}
                alignEnd={
                  index === firstEndAlignedGroupIndex && !hasTopbarWidgets
                }
              />
            </Fragment>
          ))}
        </nav>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 border-t border-[#eef1f5] bg-gradient-to-r from-white to-white/0 dark:from-[#161b22] dark:to-[#161b22]/0"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 border-t border-[#eef1f5] bg-gradient-to-l from-white to-white/0 dark:from-[#161b22] dark:to-[#161b22]/0"
        />
      </div>
    );
  }

  if (variant === "mobile") {
    return (
      <div className="relative w-full max-w-full overflow-hidden lg:hidden">
        <nav
          ref={mobileNavRef}
          aria-label={`${selectedGroup?.label ?? "선택된"} 하위 메뉴`}
          className="scrollbar-none flex h-[3.25rem] w-full min-w-0 cursor-grab touch-pan-x select-none gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain border-t border-[#eef1f5] px-3 py-2 scroll-px-3 active:cursor-grabbing [-webkit-overflow-scrolling:touch] sm:gap-2 sm:px-6 sm:scroll-px-6"
          onClickCapture={handleMobileNavClickCapture}
          onPointerCancel={handleMobileNavPointerEnd}
          onPointerDown={handleMobileNavPointerDown}
          onPointerMove={handleMobileNavPointerMove}
          onPointerUp={handleMobileNavPointerEnd}
        >
          {selectedItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href, currentHref)}
              variant="mobile"
            />
          ))}
        </nav>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 border-t border-[#eef1f5] bg-gradient-to-r from-white to-white/0 dark:from-[#161b22] dark:to-[#161b22]/0"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 border-t border-[#eef1f5] bg-gradient-to-l from-white to-white/0 dark:from-[#161b22] dark:to-[#161b22]/0"
        />
      </div>
    );
  }

  return (
    <nav aria-label={`${selectedGroup?.label ?? "선택된"} 하위 메뉴`}>
      <section aria-label={selectedGroup?.label}>
        <p className="px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#697386]">
          {selectedGroup?.label}
        </p>
        <div className="mt-2 space-y-1 border-l border-[#d9dee7] pl-3">
          {selectedItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href, currentHref)}
              variant="desktop"
            />
          ))}
        </div>
      </section>
    </nav>
  );
}

function useCurrentScheduleAlert({
  enabled,
  initialAlert,
  schedules,
}: {
  enabled: boolean;
  initialAlert: NavigationTopbarCurrentScheduleAlert | null;
  schedules: NavigationTopbarCurrentScheduleItem[];
}) {
  const [alert, setAlert] = useState(initialAlert);

  useEffect(() => {
    if (!enabled || !initialAlert) {
      return;
    }

    const baseAlert = initialAlert;

    function updateAlert() {
      setAlert(
        createNavigationCurrentScheduleAlert(
          createCurrentCommonScheduleAlert(schedules),
          baseAlert,
        ),
      );
    }

    const timeoutId = window.setTimeout(updateAlert, 0);
    const intervalId = window.setInterval(updateAlert, 30_000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [enabled, initialAlert, schedules]);

  return enabled && initialAlert ? alert : initialAlert;
}

function createNavigationCurrentScheduleAlert(
  alert: CurrentCommonScheduleAlert | null,
  baseAlert: NavigationTopbarCurrentScheduleAlert,
): NavigationTopbarCurrentScheduleAlert {
  if (alert) {
    return {
      ...baseAlert,
      ...alert,
      status: "active",
    };
  }

  return {
    ...baseAlert,
    content: "현재 일정 없음",
    status: "empty",
    timeLabel: "",
    weekdayLabel: "",
  };
}

function isTopbarDdayDue(ddayLabel: string) {
  const normalizedLabel = ddayLabel.trim().toLowerCase();

  return normalizedLabel === "d-day" || normalizedLabel === "d-0";
}

function isTopbarOverdue(ddayLabel: string) {
  return /^d\+\d+$/.test(ddayLabel.trim().toLowerCase());
}

function useRefrigeratorFoodExpirationTopbarAlert() {
  const [alert, setAlert] = useState<NavigationTopbarFoodExpirationAlert>(
    createNavigationFoodExpirationAlert(null),
  );

  useEffect(() => {
    function updateAlert() {
      setAlert(
        createNavigationFoodExpirationAlert(
          createRefrigeratorFoodExpirationAlert(
            readRefrigeratorItemsFromStorage(),
          ),
        ),
      );
    }

    function updateFromStorage(event: StorageEvent) {
      if (event.key === null || event.key === refrigeratorItemsStorageKey) {
        updateAlert();
      }
    }

    const timeoutId = window.setTimeout(updateAlert, 0);

    window.addEventListener(refrigeratorItemsStorageEventName, updateAlert);
    window.addEventListener("storage", updateFromStorage);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(refrigeratorItemsStorageEventName, updateAlert);
      window.removeEventListener("storage", updateFromStorage);
    };
  }, []);

  return alert;
}

function createNavigationFoodExpirationAlert(
  alert: RefrigeratorFoodExpirationAlert | null,
): NavigationTopbarFoodExpirationAlert {
  if (alert) {
    return {
      ...alert,
      label: "식품 유통기한",
      status: "active",
    };
  }

  return {
    ddayLabel: "",
    itemName: "임박 없음",
    items: [],
    label: "식품 유통기한",
    status: "empty",
  };
}

export function TopbarWidgetGroup({
  birthdayAlert,
  currentScheduleAlert,
  dischargeAlert,
  expirationAlert,
  vacationAlert,
}: {
  birthdayAlert?: NavigationTopbarBirthdayAlert | null;
  currentScheduleAlert?: NavigationTopbarCurrentScheduleAlert | null;
  dischargeAlert?: NavigationTopbarDischargeAlert | null;
  expirationAlert?: NavigationTopbarAlert | null;
  vacationAlert?: NavigationTopbarVacationAlert | null;
}) {
  const [ddayModalOpen, setDdayModalOpen] = useState(false);
  const dismissedDdayModalKeyRef = useRef<string | null>(null);
  const ddayModalTitleId = useId();
  const ddayModalDescriptionId = useId();
  const foodExpirationAlert = useRefrigeratorFoodExpirationTopbarAlert();
  const birthdayDdayItems =
    birthdayAlert?.items.filter((item) => isTopbarDdayDue(item.ddayLabel)) ?? [];
  const dischargeDdayItems =
    dischargeAlert?.items.filter((item) => isTopbarDdayDue(item.ddayLabel)) ??
    [];
  const expirationDdayItems =
    expirationAlert?.items.filter(
      (item) =>
        isTopbarDdayDue(item.ddayLabel) || isTopbarOverdue(item.ddayLabel),
    ) ?? [];
  const foodExpirationDdayItems = foodExpirationAlert.items.filter((item) =>
    isTopbarDdayDue(item.ddayLabel) || isTopbarOverdue(item.ddayLabel),
  );
  const vacationDdayItems =
    vacationAlert?.items.filter((item) => isTopbarDdayDue(item.ddayLabel)) ?? [];
  const ddayModalKey = createTopbarDdayModalKey(
    birthdayDdayItems,
    dischargeDdayItems,
    expirationDdayItems,
    foodExpirationDdayItems,
    vacationDdayItems,
  );

  useEffect(() => {
    if (!ddayModalKey) {
      dismissedDdayModalKeyRef.current = null;
      return;
    }

    if (dismissedDdayModalKeyRef.current === ddayModalKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDdayModalOpen(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [ddayModalKey]);

  function closeDdayModal() {
    dismissedDdayModalKeyRef.current = ddayModalKey;
    setDdayModalOpen(false);
  }

  if (
    !currentScheduleAlert &&
    !birthdayAlert &&
    !dischargeAlert &&
    !expirationAlert &&
    !vacationAlert &&
    !foodExpirationAlert
  ) {
    return null;
  }

  return (
    <>
      <div
        aria-label="상단 위젯"
        className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2"
        role="group"
      >
        {currentScheduleAlert ? (
          <TopbarCurrentScheduleLink alert={currentScheduleAlert} />
        ) : null}
        {vacationAlert ? (
          <TopbarVacationAlertButton alert={vacationAlert} />
        ) : null}
        {dischargeAlert ? (
          <TopbarDischargeAlertButton alert={dischargeAlert} />
        ) : null}
        {birthdayAlert ? (
          <TopbarBirthdayAlertButton alert={birthdayAlert} />
        ) : null}
        {expirationAlert ? (
          <TopbarExpirationAlertButton alert={expirationAlert} />
        ) : null}
        <TopbarFoodExpirationAlertButton alert={foodExpirationAlert} />
      </div>
      {ddayModalOpen && ddayModalKey ? (
        <AppModal
          className="max-w-xl"
          describedBy={ddayModalDescriptionId}
          labelledBy={ddayModalTitleId}
          onClose={closeDdayModal}
        >
          <TopbarDdayAlertModalContent
            birthdayItems={birthdayDdayItems}
            descriptionId={ddayModalDescriptionId}
            dischargeItems={dischargeDdayItems}
            expirationItems={expirationDdayItems}
            foodExpirationItems={foodExpirationDdayItems}
            onClose={closeDdayModal}
            titleId={ddayModalTitleId}
            vacationItems={vacationDdayItems}
          />
        </AppModal>
      ) : null}
    </>
  );
}

function createTopbarDdayModalKey(
  birthdayItems: NavigationTopbarBirthdayAlertItem[],
  dischargeItems: NavigationTopbarDischargeAlertItem[],
  expirationItems: NavigationTopbarAlertItem[],
  foodExpirationItems: NavigationTopbarFoodExpirationAlertItem[],
  vacationItems: NavigationTopbarVacationAlertItem[],
) {
  const birthdayKeys = birthdayItems.map((item) => `birthday:${item.id}`);
  const dischargeKeys = dischargeItems.map((item) => `discharge:${item.id}`);
  const expirationKeys = expirationItems.map((item) => `expiration:${item.id}`);
  const foodExpirationKeys = foodExpirationItems.map(
    (item) => `food-expiration:${item.id}`,
  );
  const vacationKeys = vacationItems.map((item) => `vacation:${item.id}`);
  const keys = [
    ...birthdayKeys,
    ...dischargeKeys,
    ...expirationKeys,
    ...foodExpirationKeys,
    ...vacationKeys,
  ];

  return keys.length > 0 ? keys.join("|") : null;
}

export function TopbarCurrentScheduleLink({
  alert,
  alignEnd,
}: {
  alert: NavigationTopbarCurrentScheduleAlert;
  alignEnd?: boolean;
}) {
  const hasSchedule = alert.status !== "empty";
  const className = [
    "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-[#b9d8e4] bg-[#edf8fb] px-2.5 text-xs font-semibold text-[#1d5f78] shadow-sm transition hover:border-[#94c4d5] hover:bg-[#dff1f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d8e4] sm:px-3",
    alignEnd ? "ml-auto" : "",
  ].join(" ");
  const title = hasSchedule
    ? `${alert.weekdayLabel} ${alert.timeLabel} ${alert.content}`
    : "현재 시간에 해당하는 공통 일정 없음";
  const ariaLabel = hasSchedule
    ? `${alert.weekdayLabel} ${alert.timeLabel} 공통 일정 ${alert.content} 열기`
    : "공통 일정표 열기, 현재 시간 일정 없음";

  return (
    <Link
      href={alert.href}
      aria-label={ariaLabel}
      className={className}
      title={title}
    >
      <span className="max-w-[10rem] truncate text-[#17475a]">
        {alert.content}
      </span>
      {hasSchedule ? (
        <span className="rounded-sm bg-white/80 px-1.5 py-0.5 text-[#1d5f78]">
          {alert.timeLabel}
        </span>
      ) : null}
    </Link>
  );
}

function TopbarExpirationAlertButton({
  alert,
  alignEnd,
}: {
  alert: NavigationTopbarAlert;
  alignEnd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const hasItems = alert.items.length > 0;
  const className = [
    "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-[#f0d28a] bg-[#fff8e8] px-2.5 text-xs font-semibold text-[#7a5200] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d28a] sm:px-3",
    "hover:border-[#e8bc5f] hover:bg-[#fff3d0]",
    hasItems && isTopbarOverdue(alert.ddayLabel)
      ? "topbar-widget-due topbar-widget-due-overdue"
      : hasItems && isTopbarDdayDue(alert.ddayLabel)
        ? "topbar-widget-due topbar-widget-due-expiration"
        : "",
    alignEnd ? "ml-auto" : "",
  ].join(" ");
  const title = hasItems
    ? `${alert.itemName} ${alert.ddayLabel}`
    : "유통기한 조치 필요 물품 없음";
  const ariaLabel = hasItems
    ? `${alert.itemName} ${alert.ddayLabel} 유통기한 조치 필요 물품 목록 열기`
    : "유통기한 조치 필요 물품 목록 열기, 대상 없음";

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
        title={title}
      >
        <span className="max-w-[8rem] truncate text-[#4a2f00]">
          {alert.itemName}
        </span>
        {hasItems ? (
          <span className="rounded-sm bg-white/80 px-1.5 py-0.5 text-[#a13a3a]">
            {alert.ddayLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <AppModal
          className="max-w-lg"
          describedBy={descriptionId}
          labelledBy={titleId}
          onClose={() => setOpen(false)}
        >
          <TopbarExpirationAlertModalContent
            alert={alert}
            descriptionId={descriptionId}
            onClose={() => setOpen(false)}
            titleId={titleId}
          />
        </AppModal>
      ) : null}
    </>
  );
}

function TopbarFoodExpirationAlertButton({
  alert,
}: {
  alert: NavigationTopbarFoodExpirationAlert;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const hasItems = alert.items.length > 0;
  const className = [
    "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-[#b7d9d4] bg-[#edf8f5] px-2.5 text-xs font-semibold text-[#196b69] shadow-sm transition hover:border-[#8fc8bf] hover:bg-[#e1f3ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7d9d4] sm:px-3",
    hasItems && isTopbarOverdue(alert.ddayLabel)
      ? "topbar-widget-due topbar-widget-due-overdue"
      : hasItems && isTopbarDdayDue(alert.ddayLabel)
        ? "topbar-widget-due topbar-widget-due-food-expiration"
        : "",
  ].join(" ");
  const title = hasItems
    ? `${alert.itemName} ${alert.ddayLabel}`
    : "냉장고 식품 유통기한 조치 필요 항목 없음";
  const ariaLabel = hasItems
    ? `${alert.itemName} ${alert.ddayLabel} 냉장고 식품 유통기한 조치 필요 목록 열기`
    : "냉장고 식품 유통기한 조치 필요 목록 열기, 대상 없음";

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
        title={title}
      >
        <span className="hidden text-[#196b69] sm:inline">식품</span>
        <span className="max-w-[8rem] truncate text-[#174f4d]">
          {alert.itemName}
        </span>
        {hasItems ? (
          <span className="rounded-sm bg-white/80 px-1.5 py-0.5 text-[#196b69]">
            {alert.ddayLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <AppModal
          className="max-w-lg"
          describedBy={descriptionId}
          labelledBy={titleId}
          onClose={() => setOpen(false)}
        >
          <TopbarFoodExpirationAlertModalContent
            alert={alert}
            descriptionId={descriptionId}
            onClose={() => setOpen(false)}
            titleId={titleId}
          />
        </AppModal>
      ) : null}
    </>
  );
}

function TopbarVacationAlertButton({
  alert,
}: {
  alert: NavigationTopbarVacationAlert;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const hasItems = alert.items.length > 0;
  const className = [
    "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-[#c7d2fe] bg-[#eef2ff] px-2.5 text-xs font-semibold text-[#3730a3] shadow-sm transition hover:border-[#a5b4fc] hover:bg-[#e0e7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7d2fe] sm:px-3",
    hasItems && isTopbarDdayDue(alert.ddayLabel)
      ? "topbar-widget-due topbar-widget-due-vacation"
      : "",
  ].join(" ");
  const title = hasItems
    ? `${alert.staffName} ${alert.ddayLabel}`
    : "예정된 승인 휴가 없음";
  const ariaLabel = hasItems
    ? `${alert.staffName} ${alert.ddayLabel} 승인 휴가 목록 열기`
    : "승인 휴가 목록 열기, 예정 없음";

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
        title={title}
      >
        <span className="hidden text-[#3730a3] sm:inline">{alert.label}</span>
        <span className="max-w-[8rem] truncate text-[#312e81]">
          {alert.staffName}
        </span>
        {hasItems ? (
          <span className="rounded-sm bg-white/80 px-1.5 py-0.5 text-[#3730a3]">
            {alert.ddayLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <AppModal
          className="max-w-lg"
          describedBy={descriptionId}
          labelledBy={titleId}
          onClose={() => setOpen(false)}
        >
          <TopbarVacationAlertModalContent
            alert={alert}
            descriptionId={descriptionId}
            onClose={() => setOpen(false)}
            titleId={titleId}
          />
        </AppModal>
      ) : null}
    </>
  );
}

function TopbarDischargeAlertButton({
  alert,
}: {
  alert: NavigationTopbarDischargeAlert;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const hasItems = alert.items.length > 0;
  const className = [
    "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-2.5 text-xs font-semibold text-[#9d3328] shadow-sm transition hover:border-[#e59b93] hover:bg-[#ffe7e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0c6c6] sm:px-3",
    hasItems && isTopbarDdayDue(alert.ddayLabel)
      ? "topbar-widget-due topbar-widget-due-discharge"
      : "",
  ].join(" ");
  const title = hasItems
    ? `${alert.youthName} ${alert.ddayLabel}`
    : "31일 이내 퇴소 예정 청소년 없음";
  const ariaLabel = hasItems
    ? `${alert.youthName} ${alert.ddayLabel} 퇴소 예정 목록 열기`
    : "퇴소 예정 목록 열기, 예정 없음";

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
        title={title}
      >
        <span className="hidden text-[#9d3328] sm:inline">{alert.label}</span>
        <span className="max-w-[8rem] truncate text-[#7a271a]">
          {alert.youthName}
        </span>
        {hasItems ? (
          <span className="rounded-sm bg-white/80 px-1.5 py-0.5 text-[#9d3328]">
            {alert.ddayLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <AppModal
          className="max-w-lg"
          describedBy={descriptionId}
          labelledBy={titleId}
          onClose={() => setOpen(false)}
        >
          <TopbarDischargeAlertModalContent
            alert={alert}
            descriptionId={descriptionId}
            onClose={() => setOpen(false)}
            titleId={titleId}
          />
        </AppModal>
      ) : null}
    </>
  );
}

function TopbarBirthdayAlertButton({
  alert,
  alignEnd,
}: {
  alert: NavigationTopbarBirthdayAlert;
  alignEnd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const hasItems = alert.items.length > 0;
  const className = [
    "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-2.5 text-xs font-semibold text-[#22633a] shadow-sm transition hover:border-[#9dcfaf] hover:bg-[#dcf0e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bddfc9] sm:px-3",
    hasItems && isTopbarDdayDue(alert.ddayLabel)
      ? "topbar-widget-due topbar-widget-due-birthday"
      : "",
    alignEnd ? "ml-auto" : "",
  ].join(" ");
  const title = hasItems
    ? `${alert.personName} ${alert.ddayLabel}`
    : "다가오는 생일 대상 없음";
  const ariaLabel = hasItems
    ? `${alert.personName} ${alert.ddayLabel} 다가오는 생일 목록 열기`
    : "다가오는 생일 목록 열기, 대상 없음";

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
        title={title}
      >
        <span className="hidden text-[#22633a] sm:inline">{alert.label}</span>
        <span className="max-w-[8rem] truncate text-[#174429]">
          {alert.personName}
        </span>
        {hasItems ? (
          <span className="rounded-sm bg-white/80 px-1.5 py-0.5 text-[#22633a]">
            {alert.ddayLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <AppModal
          className="max-w-lg"
          describedBy={descriptionId}
          labelledBy={titleId}
          onClose={() => setOpen(false)}
        >
          <TopbarBirthdayAlertModalContent
            alert={alert}
            descriptionId={descriptionId}
            onClose={() => setOpen(false)}
            titleId={titleId}
          />
        </AppModal>
      ) : null}
    </>
  );
}

export function TopbarDdayAlertModalContent({
  birthdayItems,
  descriptionId,
  dischargeItems = [],
  expirationItems,
  foodExpirationItems,
  onClose,
  titleId,
  vacationItems = [],
}: {
  birthdayItems: NavigationTopbarBirthdayAlertItem[];
  descriptionId: string;
  dischargeItems?: NavigationTopbarDischargeAlertItem[];
  expirationItems: NavigationTopbarAlertItem[];
  foodExpirationItems: NavigationTopbarFoodExpirationAlertItem[];
  onClose: () => void;
  titleId: string;
  vacationItems?: NavigationTopbarVacationAlertItem[];
}) {
  return (
    <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#eef1f5] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-[#196b69]">D-Day</p>
          <h2
            id={titleId}
            className="mt-1 break-words text-xl font-semibold leading-tight text-[#16181d]"
          >
            오늘 확인할 알림
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-[#697386]">
            오늘 도래한 일정과 아직 조치되지 않은 유통기한 경과 항목입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
        >
          닫기
        </button>
      </div>
      <div className="space-y-5 px-5 py-5">
        {dischargeItems.length > 0 ? (
          <section aria-label="오늘 퇴소" className="space-y-2">
            <h3 className="text-sm font-semibold text-[#9d3328]">오늘 퇴소</h3>
            <ul className="divide-y divide-[#f4d7d4] rounded-md border border-[#f0c6c6] bg-[#fff6f5]">
              {dischargeItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.rosterHref}
                    onClick={onClose}
                    className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#ffe9e6] focus:outline-none focus:ring-2 focus:ring-[#f0c6c6]"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                        {item.name}
                      </span>
                      <span className="mt-1 block text-xs text-[#697386]">
                        퇴소 예정일{" "}
                        {formatYouthDischargeAlertDateWithWeekday(
                          item.dischargeDate,
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-2.5 py-1 text-xs font-semibold text-[#9d3328]">
                      {item.ddayLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {vacationItems.length > 0 ? (
          <section aria-label="오늘 휴가" className="space-y-2">
            <h3 className="text-sm font-semibold text-[#3730a3]">오늘 휴가</h3>
            <ul className="divide-y divide-[#d7ddff] rounded-md border border-[#c7d2fe] bg-[#f6f7ff]">
              {vacationItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.workScheduleHref}
                    onClick={onClose}
                    className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#e8ecff] focus:outline-none focus:ring-2 focus:ring-[#c7d2fe]"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                          {item.staffName}
                        </span>
                        <span className="rounded-md border border-[#c7d2fe] bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#3730a3]">
                          {item.vacationLabel}
                        </span>
                      </span>
                      <span className="mt-1 block break-words text-xs text-[#697386] [overflow-wrap:anywhere]">
                        {item.detailLabel}
                      </span>
                      <span className="mt-1 block text-xs text-[#697386]">
                        휴가일 {formatTopbarVacationDate(item.date)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#3730a3]">
                      {item.ddayLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {birthdayItems.length > 0 ? (
          <section aria-label="오늘 생일" className="space-y-2">
            <h3 className="text-sm font-semibold text-[#22633a]">오늘 생일</h3>
            <ul className="divide-y divide-[#dceee4] rounded-md border border-[#bddfc9] bg-[#f4fbf6]">
              {birthdayItems.map((item) => (
                <li
                  key={`${item.typeLabel}-${item.id}`}
                  className="flex min-w-0 items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                        {item.name}
                      </span>
                      <span className="rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-2 py-0.5 text-xs font-semibold text-[#22633a]">
                        {item.typeLabel}
                      </span>
                    </span>
                    <span className="mt-1 block break-words text-xs text-[#697386] [overflow-wrap:anywhere]">
                      {item.detailLabel}
                    </span>
                    <span className="mt-1 block text-xs text-[#697386]">
                      생년월일 {formatBirthdayAlertDate(item.birthDate)} · 생일{" "}
                      {formatBirthdayAlertDateWithWeekday(item.birthdayDate)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md border border-[#9dcfaf] bg-[#e8f5ed] px-2.5 py-1 text-xs font-semibold text-[#22633a]">
                    {item.ddayLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {foodExpirationItems.length > 0 ? (
          <section aria-label="식품 유통기한 도래·경과" className="space-y-2">
            <h3 className="text-sm font-semibold text-[#196b69]">
              식품 유통기한 도래·경과
            </h3>
            <ul className="divide-y divide-[#d8ebe8] rounded-md border border-[#b7d9d4] bg-[#f1faf8]">
              {foodExpirationItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={[
                      "flex min-w-0 items-center justify-between gap-3 px-4 py-3 transition focus:outline-none focus:ring-2",
                      isTopbarOverdue(item.ddayLabel)
                        ? "hover:bg-[#fff5f2] focus:ring-[#f0c6c6]"
                        : "hover:bg-[#e1f3ef] focus:ring-[#b7d9d4]",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                        {item.itemName}
                      </span>
                      <span className="mt-1 block text-xs text-[#697386]">
                        {item.locationLabel} · 유통기한{" "}
                        {formatTopbarAlertDate(item.expirationDate)}
                      </span>
                    </span>
                    <span
                      className={[
                        "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold",
                        isTopbarOverdue(item.ddayLabel)
                          ? "border-[#f0c6c6] bg-[#fff1f1] text-[#9d3328]"
                          : "border-[#b7d9d4] bg-[#edf8f5] text-[#196b69]",
                      ].join(" ")}
                    >
                      {item.ddayLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {expirationItems.length > 0 ? (
          <section aria-label="유통기한 도래·경과" className="space-y-2">
            <h3 className="text-sm font-semibold text-[#946200]">
              유통기한 도래·경과
            </h3>
            <ul className="divide-y divide-[#f5e5be] rounded-md border border-[#f0d28a] bg-[#fffaf0]">
              {expirationItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={[
                      "flex min-w-0 items-center justify-between gap-3 px-4 py-3 transition focus:outline-none focus:ring-2",
                      isTopbarOverdue(item.ddayLabel)
                        ? "hover:bg-[#fff5f2] focus:ring-[#f0c6c6]"
                        : "hover:bg-[#fff3d0] focus:ring-[#f0d28a]",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                        {item.itemName}
                      </span>
                      <span className="mt-1 block text-xs text-[#697386]">
                        유통기한 {formatTopbarAlertDate(item.expirationDate)}
                      </span>
                    </span>
                    <span
                      className={[
                        "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold",
                        isTopbarOverdue(item.ddayLabel)
                          ? "border-[#f0c6c6] bg-[#fff1f1] text-[#9d3328]"
                          : "border-[#f0d28a] bg-[#fff8e8] text-[#946200]",
                      ].join(" ")}
                    >
                      {item.ddayLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function TopbarFoodExpirationAlertModalContent({
  alert,
  descriptionId,
  onClose,
  titleId,
}: {
  alert: NavigationTopbarFoodExpirationAlert;
  descriptionId: string;
  onClose: () => void;
  titleId: string;
}) {
  return (
    <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#eef1f5] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-[#196b69]">식품 유통기한</p>
          <h2
            id={titleId}
            className="mt-1 break-words text-xl font-semibold leading-tight text-[#16181d]"
          >
            냉장고 식품 유통기한
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-[#697386]">
            유통기한이 지난 항목과 31일 이내에 도래하는 냉장고 식품입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
        >
          닫기
        </button>
      </div>
      {alert.items.length > 0 ? (
        <ul className="divide-y divide-[#eef1f5] px-5">
          {alert.items.map((item) => (
            <li key={item.id} className="py-4">
              <Link
                href={item.href}
                onClick={onClose}
                className={[
                  "-mx-2 flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 transition focus:outline-none focus:ring-2",
                  isTopbarOverdue(item.ddayLabel)
                    ? "hover:bg-[#fff5f2] focus:ring-[#f0c6c6]"
                    : "hover:bg-[#edf8f5] focus:ring-[#b7d9d4]",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                    {item.itemName}
                  </span>
                  <span className="mt-1 block text-xs text-[#697386]">
                    {item.locationLabel} · 유통기한{" "}
                    {formatTopbarAlertDate(item.expirationDate)}
                  </span>
                </span>
                <span
                  className={[
                    "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold",
                    isTopbarOverdue(item.ddayLabel)
                      ? "border-[#f0c6c6] bg-[#fff1f1] text-[#9d3328]"
                      : "border-[#b7d9d4] bg-[#edf8f5] text-[#196b69]",
                  ].join(" ")}
                >
                  {item.ddayLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          유통기한이 지난 항목 또는 31일 이내에 도래하는 냉장고 식품이 없습니다.
        </p>
      )}
    </div>
  );
}

export function TopbarVacationAlertModalContent({
  alert,
  descriptionId,
  onClose,
  titleId,
}: {
  alert: NavigationTopbarVacationAlert;
  descriptionId: string;
  onClose: () => void;
  titleId: string;
}) {
  return (
    <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#eef1f5] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-[#3730a3]">휴가</p>
          <h2
            id={titleId}
            className="mt-1 break-words text-xl font-semibold leading-tight text-[#16181d]"
          >
            예정된 승인 휴가
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-[#697386]">
            승인 완료된 휴가 신청 중 31일 이내에 사용 예정인 휴가입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
        >
          닫기
        </button>
      </div>
      {alert.items.length > 0 ? (
        <ul className="divide-y divide-[#eef1f5] px-5">
          {alert.items.map((item) => (
            <li key={item.id} className="py-4">
              <Link
                href={item.workScheduleHref}
                onClick={onClose}
                className="-mx-2 flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 transition hover:bg-[#eef2ff] focus:outline-none focus:ring-2 focus:ring-[#c7d2fe]"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                      {item.staffName}
                    </span>
                    <span className="rounded-md border border-[#c7d2fe] bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#3730a3]">
                      {item.vacationLabel}
                    </span>
                  </span>
                  <span className="mt-1 block break-words text-xs text-[#697386] [overflow-wrap:anywhere]">
                    {item.detailLabel}
                  </span>
                  <span className="mt-1 block text-xs text-[#697386]">
                    휴가일 {formatTopbarVacationDate(item.date)}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#3730a3]">
                  {item.ddayLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          31일 이내에 예정된 승인 휴가가 없습니다.
        </p>
      )}
    </div>
  );
}

export function TopbarDischargeAlertModalContent({
  alert,
  descriptionId,
  onClose,
  titleId,
}: {
  alert: NavigationTopbarDischargeAlert;
  descriptionId: string;
  onClose: () => void;
  titleId: string;
}) {
  return (
    <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#eef1f5] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-[#9d3328]">퇴소</p>
          <h2
            id={titleId}
            className="mt-1 break-words text-xl font-semibold leading-tight text-[#16181d]"
          >
            퇴소 예정 청소년
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-[#697386]">
            오늘부터 31일 이내에 퇴소 예정일이 있는 청소년입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
        >
          닫기
        </button>
      </div>
      {alert.items.length > 0 ? (
        <ul className="divide-y divide-[#eef1f5] px-5">
          {alert.items.map((item) => (
            <li key={item.id} className="py-4">
              <Link
                href={item.rosterHref}
                onClick={onClose}
                className="-mx-2 flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 transition hover:bg-[#fff5f2] focus:outline-none focus:ring-2 focus:ring-[#f0c6c6]"
              >
                <span className="min-w-0">
                  <span className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                    {item.name}
                  </span>
                  <span className="mt-1 block text-xs text-[#697386]">
                    퇴소 예정일{" "}
                    {formatYouthDischargeAlertDateWithWeekday(
                      item.dischargeDate,
                    )}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-2.5 py-1 text-xs font-semibold text-[#9d3328]">
                  {item.ddayLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          31일 이내에 퇴소 예정인 청소년이 없습니다.
        </p>
      )}
      <div className="border-t border-[#eef1f5] px-5 py-4">
        <Link
          href="/youth/roster"
          onClick={onClose}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#245d8f] px-4 text-sm font-semibold text-white transition hover:bg-[#1b4a73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdd7f0] sm:w-auto"
        >
          청소년 명단으로 이동
        </Link>
      </div>
    </div>
  );
}

export function TopbarBirthdayAlertModalContent({
  alert,
  descriptionId,
  onClose,
  titleId,
}: {
  alert: NavigationTopbarBirthdayAlert;
  descriptionId: string;
  onClose: () => void;
  titleId: string;
}) {
  return (
    <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#eef1f5] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-[#22633a]">생일</p>
          <h2
            id={titleId}
            className="mt-1 break-words text-xl font-semibold leading-tight text-[#16181d]"
          >
            다가오는 생일
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-[#697386]">
            직원과 입소중 청소년 중 31일 이내에 생일이 있는 대상입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
        >
          닫기
        </button>
      </div>
      {alert.items.length > 0 ? (
        <ul className="divide-y divide-[#eef1f5] px-5">
          {alert.items.map((item) => (
            <li key={`${item.typeLabel}-${item.id}`} className="py-4">
              <div className="-mx-2 flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                      {item.name}
                    </span>
                    <span className="rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-2 py-0.5 text-xs font-semibold text-[#22633a]">
                      {item.typeLabel}
                    </span>
                  </span>
                  <span className="mt-1 block break-words text-xs text-[#697386] [overflow-wrap:anywhere]">
                    {item.detailLabel}
                  </span>
                  <span className="mt-1 block text-xs text-[#697386]">
                    생년월일 {formatBirthdayAlertDate(item.birthDate)} · 생일{" "}
                    {formatBirthdayAlertDateWithWeekday(item.birthdayDate)}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-2.5 py-1 text-xs font-semibold text-[#22633a]">
                  {item.ddayLabel}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          31일 이내에 생일이 있는 직원 또는 입소중 청소년이 없습니다.
        </p>
      )}
      <div className="border-t border-[#eef1f5] px-5 py-4">
        <Link
          href="/youth/roster"
          onClick={onClose}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#196b69] px-4 text-sm font-semibold text-white transition hover:bg-[#12514f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7eceb] sm:w-auto"
        >
          청소년 명단으로 이동
        </Link>
      </div>
    </div>
  );
}

export function TopbarExpirationAlertModalContent({
  alert,
  descriptionId,
  onClose,
  titleId,
}: {
  alert: NavigationTopbarAlert;
  descriptionId: string;
  onClose: () => void;
  titleId: string;
}) {
  return (
    <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#eef1f5] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-[#946200]">유통기한</p>
          <h2
            id={titleId}
            className="mt-1 break-words text-xl font-semibold leading-tight text-[#16181d]"
          >
            유통기한 조치 필요 물품
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-[#697386]">
            유통기한이 지난 항목과 31일 이내에 도래하는 식품 목록입니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Link
            href={createCafeItemExpiringFoodPrintHref()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-md border border-[#0f5553] bg-[#196b69] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#12514f] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
          >
            PDF 출력 · 15일 이내
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
          >
            닫기
          </button>
        </div>
      </div>
      {alert.items.length > 0 ? (
        <ul className="divide-y divide-[#eef1f5] px-5">
          {alert.items.map((item) => (
            <li key={item.id} className="py-4">
              <Link
                href={item.href}
                onClick={onClose}
                className={[
                  "-mx-2 flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 transition focus:outline-none focus:ring-2",
                  isTopbarOverdue(item.ddayLabel)
                    ? "hover:bg-[#fff5f2] focus:ring-[#f0c6c6]"
                    : "hover:bg-[#fff8e8] focus:ring-[#f0d28a]",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                    {item.itemName}
                  </span>
                  <span className="mt-1 block text-xs text-[#697386]">
                    유통기한 {formatTopbarAlertDate(item.expirationDate)}
                  </span>
                </span>
                <span
                  className={[
                    "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold",
                    isTopbarOverdue(item.ddayLabel)
                      ? "border-[#f0c6c6] bg-[#fff1f1] text-[#9d3328]"
                      : "border-[#f0d28a] bg-[#fff8e8] text-[#a13a3a]",
                  ].join(" ")}
                >
                  {item.ddayLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          유통기한이 지난 항목 또는 31일 이내에 도래하는 물품이 없습니다.
        </p>
      )}
    </div>
  );
}

function CategoryLink({
  group,
  active,
  alignEnd,
}: {
  group: NavigationGroup;
  active: boolean;
  alignEnd?: boolean;
}) {
  const href = group.items[0]?.href ?? "/";
  const base =
    "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-semibold transition";
  const activeClass = "bg-[#196b69] text-white";
  const idleClass = "text-[#394150] hover:bg-[#eef4f4] hover:text-[#143f3e]";

  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={[
        base,
        alignEnd ? "ml-auto" : "",
        active ? activeClass : idleClass,
      ].join(" ")}
      draggable={false}
    >
      <span>{group.label}</span>
      <NavPendingDot variant="topbar" />
    </Link>
  );
}

function NavLink({
  item,
  active,
  variant,
}: {
  item: NavigationItem;
  active: boolean;
  variant: "mobile" | "desktop";
}) {
  const base =
    variant === "mobile"
      ? "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition sm:px-3"
      : "relative flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-sm font-medium transition";
  const activeClass =
    variant === "mobile"
      ? "bg-[#196b69] text-white"
      : "bg-[#e5f2f1] text-[#0f5553]";
  const idleClass =
    variant === "mobile"
      ? "text-[#4a5568] hover:bg-[#eef4f4] hover:text-[#143f3e]"
      : "text-[#4a5568] hover:bg-white hover:text-[#16181d]";

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[base, active ? activeClass : idleClass].join(" ")}
      data-active-nav={active ? "true" : undefined}
      draggable={false}
    >
      <span>{item.label}</span>
      <NavPendingDot variant={variant} />
    </Link>
  );
}

function NavPendingDot({
  variant,
}: {
  variant: "mobile" | "desktop" | "topbar";
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={[
        "absolute size-1.5 rounded-full bg-current transition-opacity",
        variant === "desktop"
          ? "right-2 top-1/2 -translate-y-1/2"
          : "right-1.5 top-1.5",
        pending ? "animate-pulse opacity-80" : "opacity-0",
      ].join(" ")}
    />
  );
}

function formatTopbarAlertDate(value: string) {
  return value.replaceAll("-", ".");
}

function formatTopbarVacationDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return formatTopbarAlertDate(value);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return formatTopbarAlertDate(value);
  }

  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);

  return `${formatTopbarAlertDate(value)} (${weekday})`;
}

function getActiveGroup(
  groups: NavigationGroup[],
  pathname: string,
  currentHref: string,
) {
  return groups.find((group) =>
    group.items.some((item) => isActivePath(pathname, item.href, currentHref)) ||
    isRelatedGroupPath(group, pathname),
  );
}

function isRelatedGroupPath(group: NavigationGroup, pathname: string) {
  const hrefs = group.items.map((item) => item.href);
  const hrefPaths = hrefs.map(getHrefPath);

  if (
    hrefPaths.includes("/") &&
    /^\/(documents|attachments)(\/|$)/.test(pathname)
  ) {
    return true;
  }

  if (hrefPaths.includes("/resources") && pathname.startsWith("/resources")) {
    return true;
  }

  if (hrefPaths.includes("/youth") && pathname.startsWith("/youth/")) {
    return true;
  }

  if (hrefPaths.includes("/account") && pathname.startsWith("/account/")) {
    return true;
  }

  if (hrefPaths.includes("/admin") && pathname.startsWith("/admin/")) {
    return true;
  }

  return false;
}

export function isActivePath(
  pathname: string,
  href: string,
  currentHref: string,
) {
  const hrefPath = getHrefPath(href);
  const hrefQuery = href.split("?")[1];

  if (hrefQuery) {
    return pathname === hrefPath && hasExpectedSearchParams(currentHref, hrefQuery);
  }

  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/drafts/new") {
    return pathname === "/drafts/new";
  }

  if (href === "/drafts") {
    return pathname === "/drafts" || /^\/drafts\/[^/]+\/edit$/.test(pathname);
  }

  if (href === "/youth") {
    return pathname === "/youth";
  }

  if (href === "/admin") {
    return pathname === "/admin";
  }

  if (href === "/work-schedule") {
    return pathname === "/work-schedule";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getCurrentHref(
  pathname: string,
  searchParams: { toString(): string },
) {
  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function getHrefPath(href: string) {
  return href.split("?")[0] ?? href;
}

function hasExpectedSearchParams(currentHref: string, expectedQuery: string) {
  const currentQuery = currentHref.split("?")[1] ?? "";
  const currentParams = new URLSearchParams(currentQuery);
  const expectedParams = new URLSearchParams(expectedQuery);

  for (const [key, value] of expectedParams) {
    if (currentParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}
