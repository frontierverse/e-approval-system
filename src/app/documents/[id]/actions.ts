"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveCurrentApprovalStep,
  deleteDraftDocument,
  recallSubmittedDocument,
  rejectCurrentApprovalStep,
  submitDraftDocument,
} from "@/lib/approval-mutations";
import { requireUser } from "@/lib/auth";

export type ApprovalDecisionState = {
  error?: string;
  values?: {
    comment: string;
  };
};

export async function submitDocumentAction(documentId: string) {
  const user = await requireUser();
  const result = await submitDraftDocument(documentId, user.id);

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?submitError=${encodeURIComponent(result.message)}`,
    );
  }

  redirect(`/documents/${result.documentId}`);
}

export async function deleteDraftDocumentAction(documentId: string) {
  const user = await requireUser();
  const result = await deleteDraftDocument(documentId, user.id);

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/sent");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent(result.message)}`,
    );
  }

  redirect("/drafts");
}

export async function recallDocumentAction(documentId: string) {
  const user = await requireUser();
  const result = await recallSubmittedDocument(documentId, user.id);

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent(result.message)}`,
    );
  }

  redirect(`/documents/${result.documentId}`);
}

export async function decideDocumentAction(
  documentId: string,
  _state: ApprovalDecisionState,
  formData: FormData,
): Promise<ApprovalDecisionState> {
  const user = await requireUser();
  const decision = formData.get("decision");
  const comment = String(formData.get("comment") ?? "").trim();

  if (decision !== "approve" && decision !== "reject") {
    return {
      error: "처리할 결재 액션을 선택하세요.",
      values: {
        comment,
      },
    };
  }

  if (decision === "reject" && comment.length < 2) {
    return {
      error: "반려할 때는 사유를 2자 이상 입력하세요.",
      values: {
        comment,
      },
    };
  }

  const result =
    decision === "approve"
      ? await approveCurrentApprovalStep(documentId, user.id, comment)
      : await rejectCurrentApprovalStep(documentId, user.id, comment);

  if (!result.ok) {
    return {
      error: result.message,
      values: {
        comment,
      },
    };
  }

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath("/completed");
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${result.documentId}`);
}
