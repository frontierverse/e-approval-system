import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  CafeComplianceNote,
  CafeComplianceNotePage,
} from "@/lib/cafe-compliance-notes-core";

const cafeComplianceNoteSelect = {
  content: true,
  createdAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
  id: true,
} as const;

export async function getCafeComplianceNotePage({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<CafeComplianceNotePage> {
  const normalizedPageSize = Math.max(1, pageSize);
  const total = await prisma.cafeComplianceNote.count();
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);
  const notes = await prisma.cafeComplianceNote.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize,
    select: cafeComplianceNoteSelect,
  });

  return {
    notes: notes.map(mapCafeComplianceNote),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
  };
}

function mapCafeComplianceNote(note: {
  content: string;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
  } | null;
  id: string;
}): CafeComplianceNote {
  return {
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    createdBy: note.createdBy,
    id: note.id,
  };
}
