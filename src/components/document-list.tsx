import Link from "next/link";
import {
  type UserSummary,
  formatDate,
  getApprovalProgress,
  getCurrentApprovalStep,
  type ApprovalDocument,
} from "@/lib/mock-data";
import { StatusBadge } from "@/components/status-badge";
import { getDocumentArchiveInfo } from "@/lib/document-archive-policy";
import { UserIdentity } from "@/components/user-identity";

type DocumentListProps = {
  documents: ApprovalDocument[];
  empty: React.ReactNode;
};

const documentListGridClass =
  "grid grid-cols-[minmax(14rem,2fr)_minmax(8rem,1fr)_minmax(7.5rem,1fr)_4.5rem_6rem_8.5rem]";

export function DocumentList({ documents, empty }: DocumentListProps) {
  if (documents.length === 0) {
    return empty;
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      <div className="hidden overflow-x-auto lg:block">
        <div className="min-w-[52rem] text-left text-sm">
          <div
            className={`${documentListGridClass} border-b border-[#d9dee7] bg-[#fbfcfd] text-xs font-semibold text-[#697386]`}
          >
            <div className="px-5 py-3">제목</div>
            <div className="px-5 py-3">작성자</div>
            <div className="px-5 py-3">현재 결재자</div>
            <div className="px-5 py-3">진행</div>
            <div className="px-5 py-3">상태</div>
            <div className="px-5 py-3 whitespace-nowrap">일자</div>
          </div>
          <div className="divide-y divide-[#eef1f5]">
            {documents.map((document) => (
              <DocumentTableRow key={document.id} document={document} />
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#eef1f5] lg:hidden">
        {documents.map((document) => (
          <DocumentCard key={document.id} document={document} />
        ))}
      </div>
    </section>
  );
}

function DocumentTableRow({ document }: { document: ApprovalDocument }) {
  const currentStep = getCurrentApprovalStep(document);
  const currentApprover = currentStep?.approver ?? null;
  const progress = getApprovalProgress(document);
  const archiveInfo = getDocumentArchiveInfo(document);

  return (
    <div
      className={`${documentListGridClass} group relative items-start transition hover:bg-[#f7fbfb]`}
    >
      <Link
        href={`/documents/${document.id}`}
        aria-label={`${document.title} 문서 보기`}
        className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#196b69]"
      >
        <span className="sr-only">{document.title} 문서 보기</span>
      </Link>
      <div className="px-5 py-4">
        <p className="font-semibold text-[#16181d] group-hover:text-[#0f5553]">
          {document.title}
        </p>
        <p className="mt-1 text-xs text-[#697386]">
          {getDocumentNumberLabel(document)} · {document.category}
        </p>
        <ArchiveHint info={archiveInfo} />
      </div>
      <div className="px-5 py-4">
        <PersonText person={document.drafter} />
      </div>
      <div className="px-5 py-4">
        {currentApprover ? (
          <PersonText person={currentApprover} />
        ) : (
          <span className="text-[#697386]">-</span>
        )}
      </div>
      <div className="px-5 py-4 text-[#394150]">
        {progress.approved}/{progress.total}
      </div>
      <div className="px-5 py-4">
        <StatusBadge type="document" status={document.status} />
      </div>
      <div className="whitespace-nowrap px-5 py-4 tabular-nums text-[#394150]">
        {formatDate(getDocumentActivityDate(document))}
      </div>
    </div>
  );
}

function DocumentCard({ document }: { document: ApprovalDocument }) {
  const currentStep = getCurrentApprovalStep(document);
  const progress = getApprovalProgress(document);
  const archiveInfo = getDocumentArchiveInfo(document);

  return (
    <Link
      href={`/documents/${document.id}`}
      className="group block p-4 transition hover:bg-[#f7fbfb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#196b69]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[#16181d] group-hover:text-[#0f5553]">
            {document.title}
          </p>
          <p className="mt-1 text-xs text-[#697386]">
            {getDocumentNumberLabel(document)} · {document.category}
          </p>
          <ArchiveHint info={archiveInfo} />
        </div>
        <StatusBadge type="document" status={document.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-[#697386]">작성자</dt>
          <dd className="mt-1 text-[#394150]">
            <PersonText person={document.drafter} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-[#697386]">현재 결재자</dt>
          <dd className="mt-1 text-[#394150]">
            {currentStep ? (
              <PersonText person={currentStep.approver} />
            ) : (
              "-"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-[#697386]">진행</dt>
          <dd className="mt-1 text-[#394150]">
            {progress.approved}/{progress.total}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-[#697386]">일자</dt>
          <dd className="mt-1 whitespace-nowrap tabular-nums text-[#394150]">
            {formatDate(getDocumentActivityDate(document))}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

function PersonText({ person }: { person: UserSummary }) {
  return (
    <UserIdentity
      user={person}
      meta={[person.departmentName, person.positionName]
        .filter(Boolean)
        .join(" / ")}
    />
  );
}

function getDocumentActivityDate(document: ApprovalDocument) {
  return document.completedAt ?? document.submittedAt ?? document.createdAt;
}

function getDocumentNumberLabel(document: ApprovalDocument) {
  return document.documentNo || "임시문서";
}

function ArchiveHint({
  info,
}: {
  info: ReturnType<typeof getDocumentArchiveInfo>;
}) {
  if (!info.applies || !info.reviewAt) {
    return null;
  }

  if (info.isReviewDue) {
    return (
      <span className="mt-2 inline-flex rounded-full bg-[#fff1ef] px-2 py-1 text-xs font-semibold text-[#9f241a]">
        보관 대상
      </span>
    );
  }

  return (
    <p className="mt-2 text-xs text-[#697386]">
      보관 검토 {formatDate(info.reviewAt)}
    </p>
  );
}
