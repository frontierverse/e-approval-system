type EmptyStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-[#cfd6e3] bg-white px-6 py-12 text-center">
      <p className="text-lg font-semibold text-[#16181d]">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#697386]">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
