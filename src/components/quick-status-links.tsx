import Link from "next/link";

export type QuickStatusLink = {
  href: string;
  label: string;
  note: string;
  value: string;
};

export function QuickStatusLinks({ items }: { items: QuickStatusLink[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-4" aria-label="빠른 현황">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-label={`${item.label} 바로가기`}
          className="group block rounded-md border border-[#d9dee7] bg-white p-5 transition hover:border-[#196b69] hover:bg-[#f7fbfb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#196b69]"
        >
          <p className="text-sm font-medium text-[#697386] group-hover:text-[#0f5553]">
            {item.label}
          </p>
          <p className="mt-4 text-3xl font-semibold text-[#16181d]">
            {item.value}
          </p>
          <p className="mt-2 text-sm text-[#697386]">{item.note}</p>
        </Link>
      ))}
    </section>
  );
}
