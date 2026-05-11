import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentFileRow } from "@/components/attachment-file-row";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageTitle } from "@/components/page-title";
import { ResourceViewerList } from "@/components/resource-viewer-list";
import { UserIdentity } from "@/components/user-identity";
import { deleteResourceAction } from "@/app/resources/actions";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { formatDateTime } from "@/lib/mock-data";
import { getResourcePostById } from "@/lib/resource-library";
import { resourceCategoryLabels } from "@/lib/resource-library-core";

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const resource = await getResourcePostById({
    currentUserId: user.id,
    currentUserRole: user.role,
    postId: id,
  });

  if (!resource) {
    notFound();
  }

  return (
    <>
      <PageTitle
        title={resource.title}
        description={`${resourceCategoryLabels[resource.category]} / ${resource.departmentName}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {resource.canManage ? (
              <>
                <Link
                  href={`/resources/${resource.id}/edit`}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-10 px-4 text-sm",
                  )}
                >
                  수정
                </Link>
                <form action={deleteResourceAction}>
                  <input type="hidden" name="resourceId" value={resource.id} />
                  <ConfirmSubmitButton
                    type="submit"
                    message="이 자료를 삭제할까요?"
                    className={buttonClass(
                      buttonStyles.base,
                      buttonStyles.danger,
                      "h-10 px-4 text-sm",
                    )}
                  >
                    삭제
                  </ConfirmSubmitButton>
                </form>
              </>
            ) : null}
            <Link
              href="/resources"
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-10 px-4 text-sm",
              )}
            >
              목록으로
            </Link>
          </div>
        }
      />

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="min-w-0 rounded-md border border-[#d9dee7] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] pb-4 text-sm text-[#697386]">
            <UserIdentity
              user={resource.author}
              meta={`${resource.departmentName} · ${resource.author.positionName ?? ""}`}
            />
            <p>
              등록 {formatDateTime(resource.createdAt)} · 수정{" "}
              {formatDateTime(resource.updatedAt)}
            </p>
          </div>
          <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-[#394150] [overflow-wrap:anywhere]">
            {resource.summary}
          </div>
        </article>

        <div className="grid min-w-0 gap-4 self-start">
          <aside className="min-w-0 rounded-md border border-[#d9dee7] bg-white p-5">
            <h2 className="text-base font-semibold text-[#16181d]">첨부파일</h2>
            {resource.attachments.length > 0 ? (
              <ul className="mt-4 min-w-0 divide-y divide-[#eef1f5] overflow-hidden rounded-md border border-[#eef1f5]">
                {resource.attachments.map((attachment) => (
                  <li key={attachment.id} className="min-w-0 px-3 py-2">
                    <AttachmentFileRow
                      fileName={attachment.fileName}
                      size={attachment.size}
                      action={
                        attachment.id ? (
                          <Link
                            href={`/resources/attachments/${attachment.id}`}
                            className={buttonClass(
                              buttonStyles.base,
                              buttonStyles.neutral,
                              "h-8 px-3 text-xs",
                            )}
                          >
                            다운로드
                          </Link>
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
                첨부파일이 없습니다.
              </p>
            )}
          </aside>

          <ResourceViewerList viewers={resource.viewers} />
        </div>
      </section>
    </>
  );
}
