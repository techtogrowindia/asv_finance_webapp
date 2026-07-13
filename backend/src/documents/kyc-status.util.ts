import { Prisma } from '@prisma/client';

/**
 * Recompute a client's KYC-active status from their APPROVED documents.
 * Mirrors the presence-check loop in loans.service.ts's computeWarnings(), but
 * requires KycDocument.status === 'APPROVED' (not just "uploaded"). Every
 * mandatory, photo-requiring DocumentType — expanded per party via appliesTo,
 * skipping NOMINEE requirements when there's no co-applicant — must be
 * approved for the client to be ACTIVE.
 *
 * Only ever toggles between PENDING <-> ACTIVE; a client already INACTIVE or
 * CLOSED (states nothing in this codebase sets yet) is left untouched.
 */
export async function recomputeClientStatus(
  tx: Prisma.TransactionClient,
  clientId: string,
  tenantId: string,
): Promise<void> {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    include: { coApplicant: true },
  });
  if (!client) return;
  if (client.status !== 'PENDING' && client.status !== 'ACTIVE') return;

  const requiredTypes = await tx.documentType.findMany({
    where: { tenantId, isMandatory: true, isActive: true, requiresPhoto: true },
  });
  const docs = await tx.kycDocument.findMany({ where: { clientId } });
  const approvedKey = new Set(
    docs.filter((d) => d.status === 'APPROVED').map((d) => `${d.documentTypeId}:${d.party}`),
  );
  const hasNominee = !!client.coApplicant;

  let complete = true;
  for (const dt of requiredTypes) {
    if (dt.appliesTo === 'NOMINEE' && !hasNominee) continue;
    const parties: Array<'CLIENT' | 'NOMINEE'> =
      dt.appliesTo === 'BOTH' ? (hasNominee ? ['CLIENT', 'NOMINEE'] : ['CLIENT']) : [dt.appliesTo];
    for (const party of parties) {
      if (!approvedKey.has(`${dt.id}:${party}`)) {
        complete = false;
        break;
      }
    }
    if (!complete) break;
  }

  const nextStatus = complete ? 'ACTIVE' : 'PENDING';
  if (nextStatus !== client.status) {
    await tx.client.update({ where: { id: clientId }, data: { status: nextStatus } });
  }
}
