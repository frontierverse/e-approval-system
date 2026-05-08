import { PageTitle } from "@/components/page-title";

export function RouteLoadingShell({
  title,
  description,
  message,
  variant = "simple",
}: {
  title: string;
  description: string;
  message: string;
  variant?: "simple" | "summary";
}) {
  return (
    <>
      <PageTitle title={title} description={description} />
      {variant === "summary" ? (
        <SummaryLoading message={message} />
      ) : (
        <SimpleLoading message={message} />
      )}
    </>
  );
}

function SimpleLoading({ message }: { message: string }) {
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5">
      <p className="text-sm font-semibold text-[#394150]">{message}</p>
      <ProgressBar />
    </section>
  );
}

function SummaryLoading({ message }: { message: string }) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-4">
        {["사용자", "부서", "직급", "문서 양식"].map((label) => (
          <article
            key={label}
            className="rounded-md border border-[#d9dee7] bg-white p-5"
          >
            <p className="text-sm font-medium text-[#697386]">{label}</p>
            <p className="mt-4 text-3xl font-semibold text-[#16181d]">-</p>
            <ProgressBar className="mt-3" />
          </article>
        ))}
      </section>

      <section className="rounded-md border border-[#d9dee7] bg-white p-5">
        <p className="text-sm font-semibold text-[#394150]">{message}</p>
      </section>
    </div>
  );
}

function ProgressBar({ className = "mt-4" }: { className?: string }) {
  return (
    <div
      aria-label="데이터 불러오는 중"
      className={`${className} h-1 overflow-hidden rounded-full bg-[#edf1f5]`}
    >
      <div className="h-full w-1/3 animate-pulse rounded-full bg-[#196b69]" />
    </div>
  );
}
