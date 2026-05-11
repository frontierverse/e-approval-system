type PageTitleProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function PageTitle({ title, description, action }: PageTitleProps) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold tracking-normal text-[#16181d] [overflow-wrap:anywhere]">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697386]">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
