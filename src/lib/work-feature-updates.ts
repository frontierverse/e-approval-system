import "server-only";

import { prisma } from "@/lib/prisma";

export type WorkFeatureUpdate = {
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  } | null;
  description: string;
  id: string;
  title: string;
};

export const workFeatureUpdateListLimit = 3;

export const workFeatureUpdateSelect = {
  createdAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
  description: true,
  id: true,
  title: true,
} as const;

export async function getRecentWorkFeatureUpdates(
  limit = workFeatureUpdateListLimit,
): Promise<WorkFeatureUpdate[]> {
  const updates = await prisma.workFeatureUpdate.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: workFeatureUpdateSelect,
  });

  return updates.map(mapWorkFeatureUpdate);
}

export function mapWorkFeatureUpdate(
  update: {
    createdAt: Date;
    createdBy: {
      id: string;
      name: string;
    } | null;
    description: string | null;
    id: string;
    title: string;
  },
): WorkFeatureUpdate {
  return {
    createdAt: update.createdAt.toISOString(),
    createdBy: update.createdBy,
    description: update.description ?? "",
    id: update.id,
    title: update.title,
  };
}
