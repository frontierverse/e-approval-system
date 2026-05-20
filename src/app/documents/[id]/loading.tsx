import { RouteLoadingShell } from "@/components/route-loading-shell";

export default function DocumentDetailLoading() {
  return (
    <RouteLoadingShell
      title={
        <>
          <span className="sr-only">문서 상세 불러오는 중</span>
          <span
            aria-hidden="true"
            className="block h-7 w-72 max-w-full animate-pulse rounded-md bg-[#edf1f5]"
          />
        </>
      }
      titleAccessory={
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-md border border-[#cfd6e3] bg-[#edf1f5]"
        >
          <span className="h-4 w-4 rounded-sm bg-[#d7dee8]" />
        </span>
      }
      description={
        <>
          <span className="sr-only">문서번호 불러오는 중</span>
          <span
            aria-hidden="true"
            className="block h-4 w-28 animate-pulse rounded-md bg-[#edf1f5]"
          />
        </>
      }
      descriptionAccessory={
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-24 animate-pulse rounded-md border border-[#cfd6e3] bg-[#edf1f5]"
        />
      }
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <span
            aria-hidden="true"
            className="block h-10 w-20 animate-pulse rounded-md bg-[#edf1f5]"
          />
          <span
            aria-hidden="true"
            className="block h-10 w-20 animate-pulse rounded-md bg-[#edf1f5]"
          />
        </div>
      }
      variant="documentDetail"
    />
  );
}
