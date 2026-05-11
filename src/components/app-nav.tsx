"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

export type NavigationItem = {
  label: string;
  href: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

type AppNavProps = {
  groups: NavigationGroup[];
  variant: "mobile" | "desktop";
};

export function AppNav({ groups, variant }: AppNavProps) {
  const pathname = usePathname();

  if (variant === "mobile") {
    return (
      <nav className="scrollbar-none flex h-[3.25rem] gap-1 overflow-x-auto overflow-y-hidden border-t border-[#eef1f5] px-3 py-2 sm:gap-2 sm:px-6 lg:hidden">
        {groups.map((group) => (
          <div key={group.label} className="flex shrink-0 items-center gap-1">
            <span className="px-2 text-[11px] font-semibold text-[#697386]">
              {group.label}
            </span>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActivePath(pathname, item.href)}
                variant="mobile"
              />
            ))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#697386]">
            {group.label}
          </p>
          <div className="mt-2 space-y-1 border-l border-[#d9dee7] pl-3">
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActivePath(pathname, item.href)}
                variant="desktop"
              />
            ))}
          </div>
        </section>
      ))}
    </nav>
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
      className={[base, active ? activeClass : idleClass].join(" ")}
    >
      <span>{item.label}</span>
      <NavPendingDot variant={variant} />
    </Link>
  );
}

function NavPendingDot({ variant }: { variant: "mobile" | "desktop" }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={[
        "absolute size-1.5 rounded-full bg-current transition-opacity",
        variant === "mobile"
          ? "right-1.5 top-1.5"
          : "right-2 top-1/2 -translate-y-1/2",
        pending ? "animate-pulse opacity-80" : "opacity-0",
      ].join(" ")}
    />
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/drafts/new") {
    return pathname === "/drafts/new";
  }

  if (href === "/drafts") {
    return pathname === "/drafts" || /^\/drafts\/[^/]+\/edit$/.test(pathname);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
