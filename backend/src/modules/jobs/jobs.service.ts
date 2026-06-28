import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobDto, UpdateJobDto, ChangeJobStatusDto, DelegateJobDto, JobFiltersDto } from './dto/job.dto';
import { JobStatus, JobPriority, Role } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailService } from '../email/email.service';

// Valid status transitions (state machine)
const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.SUBMITTED]:    [JobStatus.UNDER_REVIEW, JobStatus.CANCELLED],
  [JobStatus.UNDER_REVIEW]: [JobStatus.ASSIGNED, JobStatus.REJECTED, JobStatus.DELEGATED, JobStatus.CANCELLED],
  [JobStatus.ACCEPTED]:     [JobStatus.ASSIGNED, JobStatus.DELEGATED, JobStatus.CANCELLED],
  [JobStatus.REJECTED]:     [JobStatus.SUBMITTED, JobStatus.CANCELLED],
  [JobStatus.DELEGATED]:    [JobStatus.ASSIGNED, JobStatus.CANCELLED],
  [JobStatus.ASSIGNED]:     [JobStatus.IN_PROGRESS, JobStatus.ON_HOLD, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]:  [JobStatus.COMPLETED, JobStatus.PAUSED, JobStatus.ON_HOLD, JobStatus.CANCELLED],
  [JobStatus.PAUSED]:       [JobStatus.IN_PROGRESS, JobStatus.ON_HOLD, JobStatus.CANCELLED],
  [JobStatus.AT_RISK]:      [JobStatus.COMPLETED, JobStatus.PAUSED, JobStatus.IN_PROGRESS, JobStatus.ON_HOLD, JobStatus.CANCELLED],
  [JobStatus.ON_HOLD]:      [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]:    [],
  [JobStatus.CANCELLED]:    [],
};

const jobSelect = {
  id: true,
  jobNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  billingCode: true,
  deadline: true,
  notes: true,
  rejectionReason: true,
  isAtRisk: true,
  delegationCount: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  stream: { select: { id: true, name: true, colorHex: true } },
  client: { select: { id: true, firstName: true, lastName: true, email: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignments: {
    where: { isActive: true },
    include: {
      designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  },
  statusHistory: {
    orderBy: { changedAt: 'asc' as const },
    include: {},
    take: 50,
  },
  _count: { select: { attachments: true, deliverables: true } },
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsGateway: NotificationsGateway,
    private webhooksService: WebhooksService,
    private emailService: EmailService,
  ) {}

  async findAll(currentUser: any, filters: JobFiltersDto) {
    const where: any = {};

    if (currentUser.role === Role.CLIENT) {
      where.clientId = currentUser.id;
    } else if (currentUser.role === Role.DESIGNER) {
      where.assignments = { some: { designerId: currentUser.id, isActive: true } };
    } else if (currentUser.role === Role.WORKFLOW_ADMIN) {
      const membership = await this.prisma.streamMember.findFirst({
        where: { userId: currentUser.id },
      });
      if (membership) where.streamId = membership.streamId;
    }

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.streamId) where.streamId = filters.streamId;
    if (filters.atRiskOnly) where.isAtRisk = true;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { jobNumber: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.job.findMany({
      where,
      select: {
        id: true,
        jobNumber: true,
        title: true,
        status: true,
        priority: true,
        deadline: true,
        isAtRisk: true,
        createdAt: true,
        updatedAt: true,
        stream: { select: { id: true, name: true, colorHex: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        assignments: {
          where: { isActive: true },
          include: {
            designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        _count: { select: { attachments: true } },
      },
      orderBy: [{ isAtRisk: 'desc' }, { deadline: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, currentUser: any) {
    const job = await this.fetchJobDetail(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    this.checkJobAccess(job, currentUser);

    // Auto-advance SUBMITTED → UNDER_REVIEW when a WF Admin or Admin first views the job
    if (
      job.status === JobStatus.SUBMITTED &&
      (currentUser.role === Role.WORKFLOW_ADMIN || currentUser.role === Role.ADMIN)
    ) {
      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id },
          data: { status: JobStatus.UNDER_REVIEW },
        }),
        this.prisma.jobStatusHistory.create({
          data: {
            jobId: id,
            fromStatus: JobStatus.SUBMITTED,
            toStatus: JobStatus.UNDER_REVIEW,
            changedById: currentUser.id,
            isSystem: true,
            reason: 'Automatically advanced to UNDER_REVIEW on admin view',
          },
        }),
      ]);
      return this.fetchJobDetail(id);
    }

    return job;
  }

  async create(dto: CreateJobDto, currentUser: any) {
    const jobNumber = await this.generateJobNumber();

    const job = await this.prisma.job.create({
      data: {
        jobNumber,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? JobPriority.MEDIUM,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        billingCode: dto.billingCode,
        streamId: dto.streamId,
        notes: dto.notes,
        clientId: currentUser.id,
        createdById: currentUser.id,
      },
      include: {
        stream: { select: { id: true, name: true, colorHex: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.prisma.jobStatusHistory.create({
      data: {
        jobId: job.id,
        fromStatus: null,
        toStatus: JobStatus.SUBMITTED,
        changedById: currentUser.id,
        isSystem: true,
      },
    });

    this.logger.log(`Job ${job.jobNumber} created by ${currentUser.email}`);
    return job;
  }

  async update(id: string, dto: UpdateJobDto, currentUser: any) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    this.checkJobAccess(job, currentUser);

    return this.prisma.job.update({
      where: { id },
      data: {
        ...dto,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
      include: {
        stream: { select: { id: true, name: true, colorHex: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async changeStatus(id: string, dto: ChangeJobStatusDto, currentUser: any) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { client: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    const allowed = STATUS_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${job.status} to ${dto.status}. Allowed: ${allowed.join(', ')}`,
      );
    }

    await this.assertStatusChangePermission(job, dto.status, currentUser);

    const updateData: any = {
      status: dto.status,
      rejectionReason: dto.status === JobStatus.REJECTED ? (dto.reason ?? null) : undefined,
      completedAt: dto.status === JobStatus.COMPLETED ? new Date() : undefined,
    };

    if (dto.status === JobStatus.COMPLETED) {
      const summary = await this.buildCompletionSummary(id);
      if (summary) {
        updateData.notes = job.notes ? `${job.notes}${summary}` : summary.trimStart();
      }
    }

    const [updatedJob] = await this.prisma.$transaction([
      this.prisma.job.update({ where: { id }, data: updateData }),
      this.prisma.jobStatusHistory.create({
        data: {
          jobId: id,
          fromStatus: job.status,
          toStatus: dto.status,
          changedById: currentUser.id,
          reason: dto.reason,
        },
      }),
    ]);

    this.notificationsGateway.broadcastJobUpdate(updatedJob.id, updatedJob.status, {
      jobNumber: updatedJob.jobNumber,
      title: updatedJob.title,
      changedBy: currentUser.id,
    });

    if (dto.status === JobStatus.COMPLETED && job.client?.email) {
      void this.emailService.addJobCompletedEmail({
        to: job.client.email,
        clientName: `${job.client.firstName} ${job.client.lastName}`,
        jobNumber: job.jobNumber,
        jobTitle: job.title,
      });
    }

    return updatedJob;
  }

  async delegate(id: string, dto: DelegateJobDto, currentUser: any) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    if (currentUser.role !== Role.ADMIN && currentUser.role !== Role.WORKFLOW_ADMIN) {
      throw new ForbiddenException('Only Admin or Workflow Admin can delegate jobs');
    }

    if (job.delegationCount >= 3) {
      throw new BadRequestException('Maximum delegation hops (3) reached');
    }

    const toStream = await this.prisma.stream.findUnique({ where: { id: dto.toStreamId } });
    if (!toStream) throw new NotFoundException('Target stream not found');

    const [updatedJob] = await this.prisma.$transaction([
      this.prisma.job.update({
        where: { id },
        data: {
          streamId: dto.toStreamId,
          status: JobStatus.DELEGATED,
          delegationCount: { increment: 1 },
        },
      }),
      this.prisma.jobDelegation.create({
        data: {
          jobId: id,
          fromStreamId: job.streamId!,
          toStreamId: dto.toStreamId,
          delegatedById: currentUser.id,
          hopNumber: job.delegationCount + 1,
          reason: dto.reason,
        },
      }),
      this.prisma.jobStatusHistory.create({
        data: {
          jobId: id,
          fromStatus: job.status,
          toStatus: JobStatus.DELEGATED,
          changedById: currentUser.id,
          reason: dto.reason,
        },
      }),
    ]);

    return updatedJob;
  }

  // Cron: every hour, flag jobs within 6 hours of their deadline
  @Cron(CronExpression.EVERY_HOUR)
  async flagAtRiskJobs() {
    const thresholdHours = 6;
    const thresholdDate = new Date();
    thresholdDate.setHours(thresholdDate.getHours() + thresholdHours);

    const atRiskJobs = await this.prisma.job.findMany({
      where: {
        isAtRisk: false,
        deadline: { lte: thresholdDate, gte: new Date() },
        status: { in: [JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.PAUSED, JobStatus.ON_HOLD] },
      },
    });

    for (const job of atRiskJobs) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { isAtRisk: true, atRiskNotifiedAt: new Date() },
      });
      this.logger.warn(`Job ${job.jobNumber} flagged as AT_RISK`);
      void this.webhooksService.notifyAtRisk(job);
    }

    if (atRiskJobs.length > 0) {
      this.logger.log(`Flagged ${atRiskJobs.length} jobs as AT_RISK`);
    }
  }

  private fetchJobDetail(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      include: {
        stream: { select: { id: true, name: true, colorHex: true } },
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignments: {
          where: { isActive: true },
          include: {
            designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            assignedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        statusHistory: { orderBy: { changedAt: 'asc' } },
        attachments: { where: { isDeleted: false } },
        delegations: {
          include: {
            fromStream: { select: { id: true, name: true } },
            toStream: { select: { id: true, name: true } },
          },
        },
        _count: { select: { attachments: true, deliverables: true } },
      },
    });
  }

  private async assertStatusChangePermission(
    job: any,
    newStatus: JobStatus,
    currentUser: any,
  ): Promise<void> {
    const { role, id: userId } = currentUser;

    // Cancel: ADMIN or the CLIENT who owns the job
    if (newStatus === JobStatus.CANCELLED) {
      if (role === Role.ADMIN) return;
      if (role === Role.CLIENT && job.clientId === userId) return;
      throw new ForbiddenException('Only a Super Admin or the job\'s client can cancel a job');
    }

    // Admin can do everything else
    if (role === Role.ADMIN) return;

    // WF Admin: triage (UNDER_REVIEW, ASSIGNED, REJECTED), manage hold, resume from hold
    if (role === Role.WORKFLOW_ADMIN) {
      const wfAllowed: JobStatus[] = [
        JobStatus.UNDER_REVIEW,
        JobStatus.ASSIGNED,
        JobStatus.REJECTED,
        JobStatus.ON_HOLD,
        JobStatus.IN_PROGRESS,
      ];
      if (wfAllowed.includes(newStatus)) return;
      throw new ForbiddenException('Workflow Admin cannot make this status change');
    }

    // Designer: execution states only, and must be the assigned designer
    if (role === Role.DESIGNER) {
      const executionStates: JobStatus[] = [
        JobStatus.IN_PROGRESS,
        JobStatus.PAUSED,
        JobStatus.COMPLETED,
        JobStatus.ON_HOLD,
      ];
      if (!executionStates.includes(newStatus)) {
        throw new ForbiddenException('Designers can only start, pause, complete, or hold jobs');
      }
      const assignment = await this.prisma.jobAssignment.findFirst({
        where: { jobId: job.id, designerId: userId, isActive: true },
      });
      if (!assignment) {
        throw new ForbiddenException('You must be the assigned designer to change this job\'s status');
      }
      return;
    }

    // Client: can resubmit their own rejected jobs (cancel handled above)
    if (role === Role.CLIENT) {
      if (newStatus === JobStatus.SUBMITTED && job.clientId === userId) return;
      throw new ForbiddenException('Clients can only resubmit rejected jobs or cancel their own jobs');
    }

    throw new ForbiddenException('Insufficient permissions for this status change');
  }

  private async buildCompletionSummary(jobId: string): Promise<string> {
    const assignments = await this.prisma.jobAssignment.findMany({
      where: { jobId },
      include: { designer: { select: { firstName: true, lastName: true } } },
    });

    if (!assignments.length) return '';

    const totalMs = assignments.reduce((sum, a) => {
      return sum + Math.max(0, a.endTime.getTime() - a.startTime.getTime());
    }, 0);
    const totalHours = +(totalMs / 3_600_000).toFixed(1);
    const designerNames = [
      ...new Set(assignments.map((a) => `${a.designer.firstName} ${a.designer.lastName}`)),
    ].join(', ');

    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    return `\n\n— Completion Summary (${dateStr}) —\nScheduled hours: ${totalHours}h | Designer(s): ${designerNames}`;
  }

  private async generateJobNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.prisma.jobSequence.upsert({
      where: { tenantId_year: { tenantId: 'default', year } },
      update: { sequence: { increment: 1 } },
      create: { year, sequence: 1 },
    });
    return `JB-${year}-${String(seq.sequence).padStart(4, '0')}`;
  }

  private checkJobAccess(job: any, currentUser: any) {
    if (currentUser.role === Role.ADMIN || currentUser.role === Role.WORKFLOW_ADMIN) return;
    if (currentUser.role === Role.CLIENT && job.clientId !== currentUser.id) {
      throw new ForbiddenException('Access denied');
    }
  }
}
