import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAssignmentDto, UnassignDto } from './dto/assignment.dto';
import { JobStatus } from '@prisma/client';

@Injectable()
export class AssignmentsService {
  constructor(private prisma: PrismaService) {}

  async assign(dto: CreateAssignmentDto, assignedById: string) {
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job) throw new NotFoundException('Job not found');

    const assignableStatuses: JobStatus[] = [JobStatus.ACCEPTED, JobStatus.ASSIGNED, JobStatus.IN_PROGRESS];
    if (!assignableStatuses.includes(job.status)) {
      throw new BadRequestException(`Cannot assign to a job in status ${job.status}`);
    }

    // Max 3 designers per job
    const currentCount = await this.prisma.jobAssignment.count({
      where: { jobId: dto.jobId, isActive: true },
    });
    if (currentCount >= 3) {
      throw new BadRequestException('Maximum 3 designers can be assigned to one job');
    }

    // If isPrimary, unset existing primary
    if (dto.isPrimary) {
      await this.prisma.jobAssignment.updateMany({
        where: { jobId: dto.jobId, isActive: true, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const assignment = await this.prisma.jobAssignment.create({
      data: {
        jobId: dto.jobId,
        designerId: dto.designerId,
        assignedById,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        isPrimary: dto.isPrimary ?? currentCount === 0, // First is primary by default
      },
      include: {
        designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        job: { select: { id: true, jobNumber: true, title: true, status: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Advance job to ASSIGNED if it was ACCEPTED
    if (job.status === JobStatus.ACCEPTED) {
      await this.prisma.job.update({
        where: { id: dto.jobId },
        data: { status: JobStatus.ASSIGNED },
      });
    }

    return assignment;
  }

  async unassign(assignmentId: string, dto: UnassignDto, requesterId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || !assignment.isActive) {
      throw new NotFoundException('Assignment not found or already inactive');
    }

    await this.prisma.$transaction([
      this.prisma.jobAssignment.update({
        where: { id: assignmentId },
        data: { isActive: false },
      }),
      this.prisma.jobAssignmentHistory.create({
        data: {
          jobId: assignment.jobId,
          designerId: assignment.designerId,
          assignedById: assignment.assignedById,
          isPrimary: assignment.isPrimary,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          unassignReason: dto.reason,
        },
      }),
    ]);

    return { message: 'Designer unassigned' };
  }

  async getDesignerSchedule(designerId: string, from?: Date, to?: Date) {
    const where: any = { designerId, isActive: true };
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = from;
      if (to) where.startTime.lte = to;
    }

    return this.prisma.jobAssignment.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            jobNumber: true,
            title: true,
            status: true,
            priority: true,
            deadline: true,
            isAtRisk: true,
            stream: { select: { id: true, name: true, colorHex: true } },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getJobAssignments(jobId: string) {
    return this.prisma.jobAssignment.findMany({
      where: { jobId, isActive: true },
      include: {
        designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, workHoursStart: true, workHoursEnd: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  // All designers' schedules for the timeline view
  async getAllDesignerSchedules(from: Date, to: Date, streamId?: string) {
    const designerWhere: any = { role: 'DESIGNER', isActive: true };
    if (streamId) {
      designerWhere.streamMemberships = { some: { streamId } };
    }

    const designers = await this.prisma.user.findMany({
      where: designerWhere,
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true,
        workHoursStart: true, workHoursEnd: true,
        assignments: {
          where: { isActive: true, startTime: { gte: from }, endTime: { lte: to } },
          include: {
            job: {
              select: {
                id: true, jobNumber: true, title: true, status: true, priority: true,
                deadline: true, isAtRisk: true,
                stream: { select: { id: true, name: true, colorHex: true } },
              },
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }],
    });

    return designers;
  }
}
