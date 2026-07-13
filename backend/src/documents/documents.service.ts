import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { clientCenterScope } from '../common/scope';
import { recomputeClientStatus } from './kyc-status.util';

type Party = 'CLIENT' | 'NOMINEE';
type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DocumentChecklistItem {
  documentTypeId: string;
  name: string;
  appliesTo: string;
  party: Party;
  isMandatory: boolean;
  documentId: string | null;
  uploadedAt: string | null;
  status: ReviewStatus | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Photo-requiring document types for this client, expanded per party (CLIENT/NOMINEE), each with upload status. */
  async checklist(user: AuthUser, clientId: string): Promise<DocumentChecklistItem[]> {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        include: { coApplicant: true },
      });
      if (!client) throw new NotFoundException('Member not found');

      const types = await tx.documentType.findMany({
        where: { isActive: true, requiresPhoto: true },
        orderBy: { name: 'asc' },
      });
      const uploaded = await tx.kycDocument.findMany({ where: { clientId } });
      const byKey = new Map(uploaded.map((d) => [`${d.documentTypeId}:${d.party}`, d]));
      const hasNominee = !!client.coApplicant;

      const items: DocumentChecklistItem[] = [];
      for (const t of types) {
        if (t.appliesTo === 'NOMINEE' && !hasNominee) continue;
        const parties: Party[] = t.appliesTo === 'BOTH' ? (hasNominee ? ['CLIENT', 'NOMINEE'] : ['CLIENT']) : [t.appliesTo];
        for (const party of parties) {
          const doc = byKey.get(`${t.id}:${party}`);
          items.push({
            documentTypeId: t.id,
            name: t.appliesTo === 'BOTH' ? `${party === 'NOMINEE' ? 'Nominee' : 'Client'} ${t.name}` : t.name,
            appliesTo: t.appliesTo,
            party,
            isMandatory: t.isMandatory,
            documentId: doc?.id ?? null,
            uploadedAt: doc?.uploadedAt.toISOString() ?? null,
            status: doc?.status ?? null,
            reviewedAt: doc?.reviewedAt?.toISOString() ?? null,
            rejectionReason: doc?.rejectionReason ?? null,
          });
        }
      }
      return items;
    });
  }

  async upload(user: AuthUser, clientId: string, documentTypeId: string, party: Party, file: Express.Multer.File) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({ where: { id: clientId, ...clientCenterScope(user) } });
      if (!client) {
        fs.unlink(file.path, () => {});
        throw new ForbiddenException('Member not in your assigned centers');
      }

      const docType = await tx.documentType.findFirst({ where: { id: documentTypeId, isActive: true } });
      if (!docType) {
        fs.unlink(file.path, () => {});
        throw new BadRequestException('Document type not found');
      }
      if (docType.appliesTo !== 'BOTH' && docType.appliesTo !== party) {
        fs.unlink(file.path, () => {});
        throw new BadRequestException(`This document does not apply to ${party.toLowerCase()}`);
      }

      // Replace any previous file for this document type (best-effort cleanup).
      const previous = await tx.kycDocument.findUnique({
        where: { clientId_documentTypeId_party: { clientId, documentTypeId, party } },
      });
      if (previous?.filePath && previous.filePath !== file.path) {
        fs.unlink(previous.filePath, () => {});
      }

      // A fresh/replacement upload always needs re-review, even if the
      // previous file at this slot was already approved.
      const saved = await tx.kycDocument.upsert({
        where: { clientId_documentTypeId_party: { clientId, documentTypeId, party } },
        update: {
          filePath: file.path,
          mimeType: file.mimetype,
          originalName: file.originalname,
          uploadedAt: new Date(),
          status: 'PENDING',
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
        },
        create: {
          tenantId: user.tenantId,
          clientId,
          documentTypeId,
          party,
          filePath: file.path,
          mimeType: file.mimetype,
          originalName: file.originalname,
        },
      });

      await recomputeClientStatus(tx, clientId, user.tenantId);
      return { documentId: saved.id, uploadedAt: saved.uploadedAt };
    });
  }

  /** Delete a document (file + row), re-checking tenant/branch/center scope. */
  async remove(user: AuthUser, documentId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const doc = await tx.kycDocument.findFirst({
        where: { id: documentId, client: clientCenterScope(user) },
      });
      if (!doc) throw new NotFoundException('Document not found');
      if (doc.filePath) fs.unlink(doc.filePath, () => {});
      await tx.kycDocument.delete({ where: { id: documentId } });
      await recomputeClientStatus(tx, doc.clientId, user.tenantId);
      return { deleted: true };
    });
  }

  /** Approve or reject an uploaded document (member.verify); recomputes the client's KYC-active status. */
  async review(user: AuthUser, documentId: string, decision: 'APPROVE' | 'REJECT', reason?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const doc = await tx.kycDocument.findFirst({
        where: { id: documentId, client: clientCenterScope(user) },
      });
      if (!doc) throw new NotFoundException('Document not found');
      if (!doc.filePath) throw new BadRequestException('Nothing uploaded for this document yet');

      const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const updated = await tx.kycDocument.update({
        where: { id: documentId },
        data: {
          status,
          reviewedBy: user.employeeId,
          reviewedAt: new Date(),
          rejectionReason: decision === 'REJECT' ? (reason ?? null) : null,
        },
      });

      await recomputeClientStatus(tx, doc.clientId, user.tenantId);
      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'KycDocument',
        entityId: documentId,
        action: decision,
        employeeId: user.employeeId,
        after: { status, reason: reason ?? null },
      });

      return { documentId: updated.id, status: updated.status, reviewedAt: updated.reviewedAt };
    });
  }

  /** Resolve a document to its file path + mime type, re-checking tenant/branch/center scope. */
  async resolveFile(user: AuthUser, documentId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const doc = await tx.kycDocument.findFirst({
        where: { id: documentId, client: clientCenterScope(user) },
      });
      if (!doc || !doc.filePath) throw new NotFoundException('Document not found');
      return { filePath: path.resolve(doc.filePath), mimeType: doc.mimeType ?? 'application/octet-stream' };
    });
  }
}
