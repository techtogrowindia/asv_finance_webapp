import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { clientCenterScope } from '../common/scope';

export interface DocumentChecklistItem {
  documentTypeId: string;
  name: string;
  appliesTo: string;
  isMandatory: boolean;
  documentId: string | null;
  uploadedAt: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Required document types for this client (skipping NOMINEE ones if no co-applicant), each with upload status. */
  async checklist(user: AuthUser, clientId: string): Promise<DocumentChecklistItem[]> {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        include: { coApplicant: true },
      });
      if (!client) throw new NotFoundException('Member not found');

      const types = await tx.documentType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
      const uploaded = await tx.kycDocument.findMany({ where: { clientId } });
      const byType = new Map(uploaded.map((d) => [d.documentTypeId, d]));
      const hasNominee = !!client.coApplicant;

      return types
        .filter((t) => !(t.appliesTo === 'NOMINEE' && !hasNominee))
        .map((t) => {
          const doc = byType.get(t.id);
          return {
            documentTypeId: t.id,
            name: t.name,
            appliesTo: t.appliesTo,
            isMandatory: t.isMandatory,
            documentId: doc?.id ?? null,
            uploadedAt: doc?.uploadedAt.toISOString() ?? null,
          };
        });
    });
  }

  async upload(user: AuthUser, clientId: string, documentTypeId: string, file: Express.Multer.File) {
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

      const party = docType.appliesTo === 'NOMINEE' ? 'NOMINEE' : 'CLIENT';

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
