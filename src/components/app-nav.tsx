"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

export type NavigationItem = {
  label: string;
  href: string;
};

type AppNavProps = {
  items: NavigationItem[];
  variant: "mobile" | "desktop";
};

export function AppNav({ items, variant }: AppNavProps) {
  const pathname = usePathname();

  if (variant === "mobile") {
    return (
      <nav className="flex gap-2 overflow-x-auto border-t border-[#eef1f5] px-4 py-2 sm:px-6 lg:hidden">
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActivePath(pathname, item.href)}
            variant="mobile"
          />
        ))}
      </nav>
    );
  }

  return (
    <nav className="space-y-1">
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActivePath(pathname, item.href)}
          variant="desktop"
        />
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
      ? "relative inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition"
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
      <NavPendingDot />
    </Link>
  );
}

function NavPendingDot() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={[
        "size-1.5 shrink-0 rounded-full bg-current transition-opacity",
        pending ? "animate-pulse opacity-80" : "opacity-0",
      ].join(" ")}
    />
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
