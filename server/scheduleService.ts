import { PublishStatus } from '@prisma/client';
import { prisma } from './db.js';

export async function getUnpublishedChangesCount(): Promise<number> {
  const [draftShifts, pubShifts, draftUnavails, pubUnavails] = await Promise.all([
    prisma.shift.findMany({ where: { status: PublishStatus.DRAFT } }),
    prisma.shift.findMany({ where: { status: PublishStatus.PUBLISHED } }),
    prisma.unavailability.findMany({ where: { status: PublishStatus.DRAFT } }),
    prisma.unavailability.findMany({ where: { status: PublishStatus.PUBLISHED } }),
  ]);

  let count = 0;

  const pubShiftMap = new Map(pubShifts.map((s) => [s.id, s]));
  const pairedPubShiftIds = new Set<string>();

  for (const d of draftShifts) {
    if (!d.publishedPairId) {
      // Newly added in draft
      count++;
      continue;
    }
    pairedPubShiftIds.add(d.publishedPairId);
    const p = pubShiftMap.get(d.publishedPairId);
    if (!p) {
      count++;
      continue;
    }
    if (
      d.personId !== p.personId ||
      d.assignmentTypeId !== p.assignmentTypeId ||
      d.date !== p.date ||
      d.isLocked !== p.isLocked ||
      (d.note ?? null) !== (p.note ?? null) ||
      (d.customStartTime ?? null) !== (p.customStartTime ?? null) ||
      (d.customEndTime ?? null) !== (p.customEndTime ?? null)
    ) {
      count++;
    }
  }

  for (const p of pubShifts) {
    if (!pairedPubShiftIds.has(p.id)) {
      // Deleted in draft
      count++;
    }
  }

  const pubUnavailMap = new Map(pubUnavails.map((u) => [u.id, u]));
  const pairedPubUnavailIds = new Set<string>();

  for (const d of draftUnavails) {
    if (!d.publishedPairId) {
      count++;
      continue;
    }
    pairedPubUnavailIds.add(d.publishedPairId);
    const p = pubUnavailMap.get(d.publishedPairId);
    if (!p) {
      count++;
      continue;
    }
    if (
      d.personId !== p.personId ||
      d.date !== p.date ||
      d.timeBlock !== p.timeBlock ||
      (d.startTime ?? null) !== (p.startTime ?? null) ||
      (d.endTime ?? null) !== (p.endTime ?? null) ||
      (d.note ?? null) !== (p.note ?? null)
    ) {
      count++;
    }
  }

  for (const p of pubUnavails) {
    if (!pairedPubUnavailIds.has(p.id)) {
      count++;
    }
  }

  return count;
}

export async function publishAllDrafts(): Promise<{ publishedShifts: number; publishedUnavailabilities: number }> {
  return prisma.$transaction(async (tx) => {
    const draftShifts = await tx.shift.findMany({ where: { status: PublishStatus.DRAFT } });
    const draftUnavails = await tx.unavailability.findMany({ where: { status: PublishStatus.DRAFT } });

    await tx.shift.deleteMany({ where: { status: PublishStatus.PUBLISHED } });
    await tx.unavailability.deleteMany({ where: { status: PublishStatus.PUBLISHED } });

    for (const d of draftShifts) {
      const pub = await tx.shift.create({
        data: {
          personId: d.personId,
          assignmentTypeId: d.assignmentTypeId,
          date: d.date,
          status: PublishStatus.PUBLISHED,
          isLocked: d.isLocked,
          note: d.note,
          customStartTime: d.customStartTime,
          customEndTime: d.customEndTime,
          publishedPairId: null,
        },
      });
      await tx.shift.update({
        where: { id: d.id },
        data: { publishedPairId: pub.id },
      });
    }

    for (const d of draftUnavails) {
      const pub = await tx.unavailability.create({
        data: {
          personId: d.personId,
          date: d.date,
          timeBlock: d.timeBlock,
          startTime: d.startTime,
          endTime: d.endTime,
          note: d.note,
          status: PublishStatus.PUBLISHED,
          publishedPairId: null,
        },
      });
      await tx.unavailability.update({
        where: { id: d.id },
        data: { publishedPairId: pub.id },
      });
    }

    return {
      publishedShifts: draftShifts.length,
      publishedUnavailabilities: draftUnavails.length,
    };
  });
}

export async function discardAllDrafts(): Promise<{ restoredShifts: number; restoredUnavailabilities: number }> {
  return prisma.$transaction(async (tx) => {
    const pubShifts = await tx.shift.findMany({ where: { status: PublishStatus.PUBLISHED } });
    const pubUnavails = await tx.unavailability.findMany({ where: { status: PublishStatus.PUBLISHED } });

    await tx.shift.deleteMany({ where: { status: PublishStatus.DRAFT } });
    await tx.unavailability.deleteMany({ where: { status: PublishStatus.DRAFT } });

    for (const p of pubShifts) {
      await tx.shift.create({
        data: {
          personId: p.personId,
          assignmentTypeId: p.assignmentTypeId,
          date: p.date,
          status: PublishStatus.DRAFT,
          isLocked: p.isLocked,
          note: p.note,
          customStartTime: p.customStartTime,
          customEndTime: p.customEndTime,
          publishedPairId: p.id,
        },
      });
    }

    for (const p of pubUnavails) {
      await tx.unavailability.create({
        data: {
          personId: p.personId,
          date: p.date,
          timeBlock: p.timeBlock,
          startTime: p.startTime,
          endTime: p.endTime,
          note: p.note,
          status: PublishStatus.DRAFT,
          publishedPairId: p.id,
        },
      });
    }

    return {
      restoredShifts: pubShifts.length,
      restoredUnavailabilities: pubUnavails.length,
    };
  });
}
