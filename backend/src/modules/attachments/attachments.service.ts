import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as fs from 'fs/promises';

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService) {}

  async create(jobId: string, file: Express.Multer.File, currentUser: any) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    // Only Admin, WA, or assigned Designer, or Client owner can attach
    if (currentUser.role === Role.CLIENT && job.clientId !== currentUser.id) {
      throw new ForbiddenException('You do not own this job');
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        jobId,
        uploadedById: currentUser.id,
        fileName: file.originalname,
        fileKey: `/uploads/${file.filename}`, // Using local storage mapping for now
        sizeBytes: BigInt(file.size),
        mimeType: file.mimetype,
      },
    });

    // Convert BigInt to string for JSON serialization
    return {
      ...attachment,
      sizeBytes: attachment.sizeBytes.toString(),
    };
  }

  async findAll(jobId: string, currentUser: any) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    if (currentUser.role === Role.CLIENT && job.clientId !== currentUser.id) {
      throw new ForbiddenException('You do not own this job');
    }

    const attachments = await this.prisma.attachment.findMany({
      where: { jobId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
    
    return attachments.map(a => ({
      ...a,
      sizeBytes: a.sizeBytes.toString(),
    }));
  }

  async remove(id: string, currentUser: any) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!attachment || attachment.isDeleted) throw new NotFoundException('Attachment not found');

    if (
      currentUser.role !== Role.ADMIN &&
      currentUser.role !== Role.WORKFLOW_ADMIN &&
      attachment.uploadedById !== currentUser.id
    ) {
      throw new ForbiddenException('Cannot delete this attachment');
    }

    return this.prisma.attachment.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
