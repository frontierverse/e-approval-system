import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { UserIdentity } from "@/components/user-identity";
import {
  getAttachmentFileDisplay,
  type AttachmentFileKind,
} from "@/lib/file-display";
import { formatDateTime } from "@/lib/mock-data";
import {
  type ResourceAttachment,
  type ResourceLibraryItem,
} from "@/lib/resource-library-core";

type ResourceLibraryListProps = {
  items: ResourceLibraryItem[];
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
  items,
  hasActiveFilter,
}: ResourceLibraryListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={
          hasActiveFilter ? "조건에 맞는 자료가 없습니다" : "등록된 자료가 없습니다"
        }
        description={
          hasActiveFilter
            ? "검색어나 분류를 조정하면 다른 자료를 찾을 수 있습니다."
            : "업무 자료가 등록되면 이곳에 표시됩니다."
        }
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      <div className="hidden lg:block">
        <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(14rem,0.9fr)_10rem_6rem] gap-5 border-b border-[#d9dee7] bg-[#f7f9fc] px-5 py-3 text-xs font-semibold text-[#394150]">
          <span>자료명</span>
          <span>첨부파일</span>
          <span>등록 정보</span>
          <span className="text-right">확인</span>
        </div>
        {items.map((item) => (
          <article
            key={item.id}
            className="border-b border-[#eef1f5] last:border-b-0"
          >
            <ResourceItemLink
              item={item}
              className="grid min-h-24 grid-cols-[minmax(0,1.8fr)_minmax(14rem,0.9fr)_10rem_6rem] items-center gap-5 px-5 py-3"
            />
          </article>
        ))}
      </div>

      <div className="divide-y divide-[#eef1f5] lg:hidden">
        {items.map((item) => (
          <article key={item.id}>
            <ResourceItemLink item={item} className="block p-3" />
          </article>
        ))}
      </div>
    </section>
  );
}

function ResourceItemLink({
  className,
  item,
}: {
  className: string;
  item: ResourceLibraryItem;
}) {
  return (
    <Link
      href={`/resources/${item.id}`}
      aria-label={`${item.title} 자료 상세 보기`}
      className={`group cursor-pointer transition hover:bg-[#f7fbfb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#196b69] ${className}`}
    >
      <ResourceTitle item={item} />
      <div className="mt-3 lg:mt-0">
        <ResourceAttachmentSummary attachments={item.attachments} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 lg:mt-0 lg:contents">
        <ResourceMeta item={item} />
        <ResourceViewCount item={item} />
      </div>
    </Link>
  );
}

function ResourceTitle({ item }: { item: ResourceLibraryItem }) {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-sm font-semibold text-[#16181d] group-hover:underline">
        {item.title}
      </h2>
      <p className="mt-1 line-clamp-1 text-xs leading-5 text-[#697386]">
        {item.summary}
      </p>
    </div>
  );
}

function ResourceAttachmentSummary({
  attachments,
}: {
  attachments: ResourceAttachment[];
}) {
  const groups = getAttachmentGroups(attachments);
  const visibleGroups = groups.slice(0, 4);
  const hiddenCount = groups
    .slice(4)
    .reduce((total, group) => total + group.count, 0);
  const summary =
    groups.length > 0
      ? `총 ${attachments.length}개 · ${groups
          .map((group) => `${group.extensionLabel} ${group.count}개`)
          .join(", ")}`
      : "첨부 없음";

  return (
    <div className="flex min-w-0 items-center gap-2" aria-label={summary}>
      <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-hidden">
        {visibleGroups.length > 0 ? (
          visibleGroups.map((group) => (
            <span
              key={group.extensionLabel}
              title={`${group.extensionLabel} ${group.count}개`}
              className={`relative inline-flex h-7 min-w-8 shrink-0 items-center justify-center rounded-md border px-1 text-[0.58rem] font-bold leading-none ${
                attachmentIconTone[group.kind]
              }`}
            >
              {group.extensionLabel}
              {group.count > 1 ? (
                <span className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full bg-[#394150] text-[0.5rem] font-semibold text-white">
                  {group.count}
                </span>
              ) : null}
            </span>
          ))
        ) : (
          <span className="text-sm text-[#8a95a6]">없음</span>
        )}
        {hiddenCount > 0 ? (
          <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-[#cfd6e3] bg-white px-2 text-xs font-semibold text-[#394150]">
            +{hiddenCount}
          </span>
        ) : null}
      </div>
      <p className="min-w-0 truncate text-xs text-[#697386]">{summary}</p>
    </div>
  );
}

function getAttachmentGroups(attachments: ResourceAttachment[]) {
  const groups = new Map<
    string,
    {
      count: number;
      extensionLabel: string;
      kind: AttachmentFileKind;
    }
  >();

  for (const attachment of attachments) {
    const file = getAttachmentFileDisplay(attachment.fileName);
    const key = file.extension || file.kind;
    const current = groups.get(key);

    if (current) {
      current.count += 1;
      continue;
    }

    groups.set(key, {
      count: 1,
      extensionLabel: file.extensionLabel,
      kind: file.kind,
    });
  }

  return Array.from(groups.values());
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
