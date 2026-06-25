import Link from "next/link";
import type { ReactNode } from "react";
import { ResourceCategoryBadge } from "@/components/resource-category-badge";
import { UserIdentity } from "@/components/user-identity";
import {
  getAttachmentFileDisplay,
  type AttachmentFileKind,
} from "@/lib/file-display";
import { formatDateTime } from "@/lib/mock-data";
import type {
  ResourceAttachment,
  ResourceLibraryItem,
} from "@/lib/resource-library-core";

type ResourceLibraryListProps = {
  compact?: boolean;
  toolbar?: ReactNode;
  items: ResourceLibraryItem[];
  firstItemNumber?: number;
  hasActiveFilter: boolean;
};

const attachmentIconTone: Record<AttachmentFileKind, string> = {
  archive: "border-[#c8d2df] bg-[#eef2f7] text-[#4a5568]",
  document: "border-[#b9c9ea] bg-[#eaf0fb] text-[#274f9f]",
  file: "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150]",
  image: "border-[#b8d9d7] bg-[#eef7f6] text-[#196b69]",
  pdf: "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
  sheet: "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]",
  slide: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
  text: "border-[#cfd6e3] bg-[#fbfcfd] text-[#394150]",
};

export function ResourceLibraryList({
  compact = false,
  firstItemNumber,
  items,
  hasActiveFilter,
  toolbar,
}: ResourceLibraryListProps) {
  const emptyTitle = hasActiveFilter
    ? "조건에 맞는 자료가 없습니다"
    : "등록된 자료가 없습니다";
  const emptyDescription = hasActiveFilter
    ? "검색어나 자료실을 조정하면 다른 자료를 찾을 수 있습니다."
    : "업무 자료가 등록되면 이곳에 표시됩니다.";

  return (
    <section className="overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      {toolbar ? (
        <div className="border-b border-[#d9dee7] bg-white px-4 py-2">
          {toolbar}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="flex min-h-60 flex-col items-center justify-center bg-white px-6 py-10 text-center">
          <p className="text-lg font-semibold text-[#16181d]">{emptyTitle}</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-[#697386]">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block">
            <div
              className={`grid grid-cols-[4rem_minmax(0,1.8fr)_minmax(14rem,0.9fr)_10rem_6rem] border-b border-[#d9dee7] bg-[#f7f9fc] text-xs font-semibold text-[#394150] ${
                compact ? "gap-4 px-4 py-2.5" : "gap-5 px-5 py-3"
              }`}
            >
              <span>번호</span>
              <span>자료명</span>
              <span>첨부파일</span>
              <span>등록 정보</span>
              <span className="text-right">확인</span>
            </div>
            {items.map((item, index) => (
              <article
                key={item.id}
                className="border-b border-[#eef1f5] last:border-b-0"
              >
                <ResourceItemLink
                  displayNumber={getResourceDisplayNumber(
                    firstItemNumber,
                    items.length,
                    index,
                  )}
                  item={item}
                  compact={compact}
                  className={`grid grid-cols-[4rem_minmax(0,1.8fr)_minmax(14rem,0.9fr)_10rem_6rem] items-center ${
                    compact
                      ? "min-h-20 gap-4 px-4 py-2"
                      : "min-h-24 gap-5 px-5 py-3"
                  }`}
                />
              </article>
            ))}
          </div>

          <div className="divide-y divide-[#eef1f5] lg:hidden">
            {items.map((item, index) => (
              <article key={item.id}>
                <ResourceItemLink
                  displayNumber={getResourceDisplayNumber(
                    firstItemNumber,
                    items.length,
                    index,
                  )}
                  item={item}
                  compact={compact}
                  className={compact ? "block p-2.5" : "block p-3"}
                />
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ResourceItemLink({
  className,
  compact = false,
  displayNumber,
  item,
}: {
  className: string;
  compact?: boolean;
  displayNumber: number;
  item: ResourceLibraryItem;
}) {
  return (
    <Link
      href={`/resources/${item.id}`}
      aria-label={`${item.title} 자료 상세 보기`}
      className={`group cursor-pointer transition hover:bg-[#f7fbfb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#196b69] ${className}`}
    >
      <ResourceNumber compact={compact} displayNumber={displayNumber} />
      <ResourceTitle compact={compact} item={item} />
      <div className={compact ? "mt-2 lg:mt-0" : "mt-3 lg:mt-0"}>
        <ResourceAttachmentSummary
          attachments={item.attachments}
          compact={compact}
        />
      </div>
      <div
        className={`flex flex-wrap items-center justify-between lg:mt-0 lg:contents ${
          compact ? "mt-2 gap-2" : "mt-3 gap-3"
        }`}
      >
        <ResourceMeta item={item} />
        <ResourceViewCount item={item} />
      </div>
    </Link>
  );
}

function ResourceNumber({
  compact = false,
  displayNumber,
}: {
  compact?: boolean;
  displayNumber: number;
}) {
  return (
    <span
      className={`block tabular-nums text-sm font-semibold text-[#697386] lg:mb-0 lg:text-center ${
        compact ? "mb-2" : "mb-3"
      }`}
    >
      {displayNumber}
    </span>
  );
}

function ResourceTitle({
  compact = false,
  item,
}: {
  compact?: boolean;
  item: ResourceLibraryItem;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <ResourceCategoryBadge
          category={item.category}
          educationLevel={item.educationLevel}
        />
        <h2 className="truncate text-sm font-semibold text-[#16181d] group-hover:underline">
          {item.title}
        </h2>
      </div>
      <p
        className={`mt-1 line-clamp-1 text-xs text-[#697386] ${
          compact ? "leading-4" : "leading-5"
        }`}
      >
        {item.summary}
      </p>
    </div>
  );
}

function getResourceDisplayNumber(
  firstItemNumber: number | undefined,
  itemCount: number,
  index: number,
) {
  const startNumber = firstItemNumber ?? itemCount;

  return Math.max(startNumber - index, 1);
}

function ResourceAttachmentSummary({
  attachments,
  compact = false,
}: {
  attachments: ResourceAttachment[];
  compact?: boolean;
}) {
  const firstAttachment = attachments[0];
  const firstFile = firstAttachment
    ? getAttachmentFileDisplay(firstAttachment.fileName)
    : null;
  const summary =
    attachments.length > 0
      ? `첨부파일 ${attachments.length}개`
      : "첨부 없음";

  return (
    <div className="min-w-0" aria-label={summary}>
      {firstAttachment && firstFile ? (
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-flex min-w-8 shrink-0 items-center justify-center rounded-md border px-1 text-[0.58rem] font-bold leading-none ${
              compact ? "h-6" : "h-7"
            } ${attachmentIconTone[firstFile.kind]}`}
          >
            {firstFile.extensionLabel}
          </span>
          <div className="flex min-w-0 items-center gap-1 text-xs">
            <span
              className="min-w-0 truncate text-[#394150]"
              title={firstAttachment.fileName}
            >
              {firstAttachment.fileName}
            </span>
            {attachments.length > 1 ? (
              <span className="shrink-0 text-[#697386]">
                외 {attachments.length - 1}개
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <span className="text-sm text-[#8a95a6]">없음</span>
      )}
    </div>
  );
}

function ResourceMeta({ item }: { item: ResourceLibraryItem }) {
  const author = item.author ?? {
    id: item.authorId,
    name: item.authorName,
    departmentName: item.departmentName,
  };

  return (
    <div className="min-w-0 text-xs text-[#697386]">
      <UserIdentity
        user={author}
        size="xs"
        nameClassName="text-[#394150]"
      />
      <time className="mt-1 block truncate" dateTime={item.createdAt}>
        {formatDateTime(item.createdAt)}
      </time>
    </div>
  );
}

function ResourceViewCount({ item }: { item: ResourceLibraryItem }) {
  return (
    <p className="text-right text-sm font-semibold text-[#394150]">
      {item.viewCount}명
    </p>
  );
}
