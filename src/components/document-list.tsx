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

type DocumentListProps = {
  documents: ApprovalDocument[];
  empty: React.ReactNode;
};

export function DocumentList({ documents, empty }: DocumentListProps) {
  if (documents.length === 0) {
    return empty;
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-[#d9dee7] bg-[#fbfcfd] text-xs font-semibold text-[#697386]">
            <tr>
              <th className="px-5 py-3">제목</th>
              <th className="px-5 py-3">작성자</th>
              <th className="px-5 py-3">현재 결재자</th>
              <th className="px-5 py-3">진행</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">일자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef1f5]">
            {documents.map((document) => (
              <DocumentTableRow key={document.id} document={document} />
            ))}
          </tbody>
        </table>
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
    <tr className="align-top transition hover:bg-[#fbfcfd]">
      <td className="px-5 py-4">
        <Link
          href={`/documents/${document.id}`}
          className="font-semibold text-[#16181d] hover:text-[#0f5553]"
        >
          {document.title}
        </Link>
        <p className="mt-1 text-xs text-[#697386]">
          {getDocumentNumberLabel(document)} · {document.category}
        </p>
        <ArchiveHint info={archiveInfo} />
      </td>
      <td className="px-5 py-4">
        <PersonText person={document.drafter} />
      </td>
      <td className="px-5 py-4">
        {currentApprover ? (
          <PersonText person={currentApprover} />
        ) : (
          <span className="text-[#697386]">-</span>
        )}
      </td>
      <td className="px-5 py-4 text-[#394150]">
        {progress.approved}/{progress.total}
      </td>
      <td className="px-5 py-4">
        <StatusBadge type="document" status={document.status} />
      </td>
      <td className="px-5 py-4 text-[#394150]">
        {formatDate(getDocumentActivityDate(document))}
      </td>
    </tr>
  );
}

function DocumentCard({ document }: { document: ApprovalDocument }) {
  const currentStep = getCurrentApprovalStep(document);
  const progress = getApprovalProgress(document);
  const archiveInfo = getDocumentArchiveInfo(document);

  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/documents/${document.id}`}
            className="font-semibold text-[#16181d] hover:text-[#0f5553]"
          >
            {document.title}
          </Link>
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
          <dd className="mt-1 text-[#394150]">
            {formatDate(getDocumentActivityDate(document))}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function PersonText({ person }: { person: UserSummary }) {
  return (
    <div>
      <p className="font-medium text-[#16181d]">{person.name}</p>
      <p className="mt-1 text-xs text-[#697386]">
        {[person.departmentName, person.positionName].filter(Boolean).join(" / ")}
      </p>
    </div>
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
