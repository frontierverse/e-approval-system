"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  return (
    <main
      ref={mainRef}
      className="scrollbar-stable min-w-0 flex-1 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1"
    >
      {children}
    </main>
  );
}
