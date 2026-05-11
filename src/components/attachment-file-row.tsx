import { formatFileSize, getAttachmentFileDisplay } from "@/lib/file-display";

type AttachmentFileRowProps = {
  action?: React.ReactNode;
  fileName: string;
  note?: string;
  size?: number;
};

const iconClasses = {
  archive: "border-[#c8d2df] bg-[#eef2f7] text-[#4a5568]",
  document: "border-[#b9c9ea] bg-[#eaf0fb] text-[#274f9f]",
  file: "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]",
  image: "border-[#b8d9d7] bg-[#eef7f6] text-[#196b69]",
  pdf: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
  sheet: "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]",
  slide: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
  text: "border-[#cfd6e3] bg-[#fbfcfd] text-[#394150]",
};

export function AttachmentFileRow({
  action,
  fileName,
  note,
  size,
}: AttachmentFileRowProps) {
  const file = getAttachmentFileDisplay(fileName);

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className={[
            "relative flex h-12 w-10 shrink-0 items-end justify-center rounded-md border pb-1.5 text-[0.58rem] font-bold leading-none",
            iconClasses[file.kind],
          ].join(" ")}
        >
          <span className="absolute right-0 top-0 h-3 w-3 rounded-bl-md border-b border-l border-current/25 bg-white/70" />
          {file.extensionLabel}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#16181d]">
            {fileName}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#697386]">
            <span>{file.kindLabel}</span>
            {size !== undefined ? <span>{formatFileSize(size)}</span> : null}
            {note ? <span>{note}</span> : null}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
