import { UserIdentity } from "@/components/user-identity";
import { formatDateTime } from "@/lib/mock-data";
import type { ResourceViewer } from "@/lib/resource-library-core";

type ResourceViewerListProps = {
  viewers: ResourceViewer[];
};

export function ResourceViewerList({ viewers }: ResourceViewerListProps) {
  return (
    <aside className="min-w-0 rounded-md border border-[#d9dee7] bg-white p-5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold text-[#16181d]">
          열람 현황
        </h2>
        <span className="shrink-0 rounded-full bg-[#e8f5ed] px-2.5 py-1 text-xs font-semibold text-[#1f6b43]">
          확인 {viewers.length}명
        </span>
      </div>

      {viewers.length > 0 ? (
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {viewers.map((viewer) => (
            <li
              key={viewer.userId}
              className="flex min-w-0 items-start gap-3 rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <UserIdentity
                  user={{
                    id: viewer.userId,
                    name: viewer.name,
                    profileImageStorageKey: viewer.profileImageStorageKey,
                    profileImageUpdatedAt: viewer.profileImageUpdatedAt,
                  }}
                  meta={`${viewer.departmentName} · ${viewer.positionName}`}
                />
                <time
                  dateTime={viewer.lastViewedAt}
                  className="mt-1 block truncate text-xs text-[#394150]"
                >
                  마지막 확인 {formatDateTime(viewer.lastViewedAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
          아직 확인한 직원이 없습니다.
        </p>
      )}
    </aside>
  );
}
