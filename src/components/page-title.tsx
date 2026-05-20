type PageTitleProps = {
  title: React.ReactNode;
  description: React.ReactNode;
  titleAccessory?: React.ReactNode;
  descriptionAccessory?: React.ReactNode;
  action?: React.ReactNode;
};

export function PageTitle({
  title,
  description,
  titleAccessory,
  descriptionAccessory,
  action,
}: PageTitleProps) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {titleAccessory}
          <h1 className="break-words text-2xl font-semibold tracking-normal text-[#16181d] [overflow-wrap:anywhere]">
            {title}
          </h1>
        </div>
        {descriptionAccessory ? (
          <p className="mt-2 flex max-w-3xl flex-wrap items-center gap-2 text-sm leading-6 text-[#697386]">
            {descriptionAccessory}
            <span>{description}</span>
          </p>
        ) : (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697386]">
            {description}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
