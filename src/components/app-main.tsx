"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const initialPathnameRef = useRef(pathname);

  useEffect(() => {
    const main = mainRef.current;

    main?.scrollTo({ top: 0, left: 0 });

    if (initialPathnameRef.current !== pathname) {
      main?.focus({ preventScroll: true });
      initialPathnameRef.current = pathname;
    }
  }, [pathname]);

  return (
    <main
      id="main-content"
      ref={mainRef}
      aria-label="주요 콘텐츠"
      className="scrollbar-stable min-w-0 flex-1 scroll-mt-44 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1"
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
