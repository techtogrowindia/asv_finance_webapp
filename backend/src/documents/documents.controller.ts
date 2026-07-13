import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { DocumentsService } from './documents.service';

const ALLOWED_MIME = /^image\/(jpeg|png|webp)$/;

@Controller('clients/:clientId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermission('member.view')
  @Get()
  checklist(@CurrentUser() user: AuthUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.documents.checklist(user, clientId);
  }

  @RequirePermission('member.edit')
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = path.join(process.env.UPLOAD_DIR || './uploads', req.params.clientId);
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${path.extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.test(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG, or WebP images are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentTypeId') documentTypeId: string,
    @Body('party') party: 'CLIENT' | 'NOMINEE' = 'CLIENT',
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!documentTypeId) throw new BadRequestException('documentTypeId is required');
    return this.documents.upload(user, clientId, documentTypeId, party, file);
  }
}

@Controller('documents')
export class DocumentFileController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermission('member.view')
  @Get(':id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { filePath, mimeType } = await this.documents.resolveFile(user, id);
    res.setHeader('Content-Type', mimeType);
    res.sendFile(filePath);
  }

  @RequirePermission('member.delete')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.remove(user, id);
  }
}
