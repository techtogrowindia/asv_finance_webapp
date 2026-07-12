import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { clientCenterScope } from '../common/scope';

type Party = 'CLIENT' | 'NOMINEE';

export interface DocumentChecklistItem {
  documentTypeId: string;
  name: string;
  appliesTo: string;
  party: Party;
  isMandatory: boolean;
  documentId: string | null;
  uploadedAt: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

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

      const saved = await tx.kycDocument.upsert({
        where: { clientId_documentTypeId_party: { clientId, documentTypeId, party } },
        update: {
          filePath: file.path,
          mimeType: file.mimetype,
          originalName: file.originalname,
          uploadedAt: new Date(),
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
      return { deleted: true };
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
