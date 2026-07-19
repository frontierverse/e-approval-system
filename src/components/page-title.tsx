type PageTitleProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  titleAccessory?: React.ReactNode;
  descriptionAccessory?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
};

export function PageTitle({
  title,
  description,
  titleAccessory,
  descriptionAccessory,
  action,
  compact = false,
}: PageTitleProps) {
  const hasDescription =
    description !== undefined || descriptionAccessory !== undefined;

  return (
    <header
      className={
        compact
          ? "mb-3 flex min-w-0 items-start justify-between gap-3"
          : `${hasDescription ? "mb-6" : "mb-4"} flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between`
      }
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {titleAccessory}
          <h1
            className={`break-words font-semibold tracking-tight text-[var(--foreground)] [overflow-wrap:anywhere] ${
              compact ? "text-xl sm:text-2xl" : "text-2xl"
            }`}
          >
            {title}
          </h1>
        </div>
        {hasDescription
          ? descriptionAccessory ? (
              <p
                className={`flex max-w-3xl flex-wrap items-center gap-2 text-sm text-[var(--text-muted)] ${
                  compact ? "mt-1 leading-5" : "mt-2 leading-6"
                }`}
              >
                {descriptionAccessory}
                <span>{description}</span>
              </p>
            ) : (
              <p
                className={`max-w-3xl text-sm text-[var(--text-muted)] ${
                  compact ? "mt-1 leading-5" : "mt-2 leading-6"
                }`}
              >
                {description}
              </p>
            )
          : null}
      </div>
      {action ? (
        <div
          className={
            compact
              ? "shrink-0"
              : "grid w-full shrink-0 sm:block sm:w-auto"
          }
        >
          {action}
        </div>
      ) : null}
    </header>
  );
}
