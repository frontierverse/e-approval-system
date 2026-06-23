"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from "react";

export type NavigationItem = {
  label: string;
  href: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
  align?: "end";
};

type AppNavProps = {
  groups: NavigationGroup[];
  variant: "mobile" | "desktop" | "topbar";
};

type MobileDragState = {
  pointerId: number | null;
  startX: number;
  scrollLeft: number;
  moved: boolean;
  suppressClick: boolean;
};

export function AppNav({ groups, variant }: AppNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = getCurrentHref(pathname, searchParams);
  const mobileNavRef = useRef<HTMLElement>(null);
  const selectedGroup = getActiveGroup(groups, pathname, currentHref) ?? groups[0];
  const selectedItems = selectedGroup?.items ?? [];
  const firstEndAlignedGroupIndex = groups.findIndex(
    (group) => group.align === "end",
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
            <CategoryLink
              key={group.label}
              group={group}
              active={group.label === selectedGroup?.label}
              alignEnd={index === firstEndAlignedGroupIndex}
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

function isActivePath(pathname: string, href: string, currentHref: string) {
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
