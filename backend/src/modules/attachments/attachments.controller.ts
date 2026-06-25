import {
  Controller, Get, Post, Delete, Param, UseGuards, UseInterceptors, UploadedFile, Request, BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import { AttachmentsService } from './attachments.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Attachments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('jobs/:jobId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const randomName = randomBytes(16).toString('hex');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadFile(
    @Param('jobId') jobId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.attachmentsService.create(jobId, file, req.user);
  }

  @Get('jobs/:jobId/attachments')
  async getAttachments(@Param('jobId') jobId: string, @Request() req: any) {
    return this.attachmentsService.findAll(jobId, req.user);
  }

  @Delete('attachments/:id')
  async deleteAttachment(@Param('id') id: string, @Request() req: any) {
    return this.attachmentsService.remove(id, req.user);
  }
}
