import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAssignmentDto, UnassignDto, UpdateAssignmentDto } from './dto/assignment.dto';
import { JobStatus } from '@prisma/client';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private notificationsGateway: NotificationsGateway,
    private notificationsService: NotificationsService,
    private webhooksService: WebhooksService,
  ) {}

  async assign(dto: CreateAssignmentDto, assignedById: string) {
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job) throw new NotFoundException('Job not found');

    const assignableStatuses: JobStatus[] = [
      JobStatus.UNDER_REVIEW, JobStatus.ACCEPTED, JobStatus.ASSIGNED, JobStatus.IN_PROGRESS,
    ];
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
        startTime: dto.startTime,
        endTime: dto.endTime,
        isPrimary: dto.isPrimary ?? currentCount === 0, // First is primary by default
      },
      include: {
        designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        job: { select: { id: true, jobNumber: true, title: true, status: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Advance job to ASSIGNED when assigning from ACCEPTED or UNDER_REVIEW
    if (job.status === JobStatus.ACCEPTED || job.status === JobStatus.UNDER_REVIEW) {
      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id: dto.jobId },
          data: { status: JobStatus.ASSIGNED },
        }),
        this.prisma.jobStatusHistory.create({
          data: {
            jobId: dto.jobId,
            fromStatus: job.status,
            toStatus: JobStatus.ASSIGNED,
            changedById: assignedById,
            isSystem: true,
            reason: 'Auto-advanced to ASSIGNED on designer assignment',
          },
        }),
      ]);
    }

    // Create DB notification
    const notification = await this.notificationsService.create({
      userId: dto.designerId,
      type: 'JOB_ASSIGNED',
      title: 'New Job Assignment',
      message: `You have been assigned to ${job.jobNumber} (${job.title}).`,
      jobId: job.id,
      metadata: { link: `/jobs/${job.id}` },
    });

    // Push via websocket
    this.notificationsGateway.sendToUser(dto.designerId, 'notification:new', notification);

    // Notify Slack — fire-and-forget, does not block the response
    void this.webhooksService.notifyDesignerAssigned(assignment);

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

    const job = await this.prisma.job.findUnique({ where: { id: assignment.jobId } });

    // Create DB notification
    const notification = await this.notificationsService.create({
      userId: assignment.designerId,
      type: 'SYSTEM',
      title: 'Job Unassigned',
      message: `You have been unassigned from ${job?.jobNumber ?? 'a job'}. Reason: ${dto.reason}`,
      jobId: assignment.jobId,
    });

    // Push via websocket
    this.notificationsGateway.sendToUser(assignment.designerId, 'notification:new', notification);

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

  async reschedule(assignmentId: string, dto: UpdateAssignmentDto) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || !assignment.isActive) {
      throw new NotFoundException('Assignment not found or already inactive');
    }
    return this.prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(dto.startTime ? { startTime: dto.startTime } : {}),
        ...(dto.endTime ? { endTime: dto.endTime } : {}),
        ...(dto.designerId ? { designerId: dto.designerId } : {}),
      },
      include: {
        designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        job: { select: { id: true, jobNumber: true, title: true } },
      },
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
