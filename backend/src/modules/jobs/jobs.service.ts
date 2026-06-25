import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobDto, UpdateJobDto, ChangeJobStatusDto, DelegateJobDto, JobFiltersDto } from './dto/job.dto';
import { JobStatus, JobPriority, Role } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';

// Valid status transitions (state machine)
const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.SUBMITTED]: [JobStatus.UNDER_REVIEW, JobStatus.CANCELLED],
  [JobStatus.UNDER_REVIEW]: [JobStatus.ACCEPTED, JobStatus.REJECTED, JobStatus.CANCELLED],
  [JobStatus.ACCEPTED]: [JobStatus.ASSIGNED, JobStatus.DELEGATED, JobStatus.CANCELLED],
  [JobStatus.REJECTED]: [JobStatus.SUBMITTED], // resubmit
  [JobStatus.DELEGATED]: [JobStatus.ASSIGNED, JobStatus.CANCELLED],
  [JobStatus.ASSIGNED]: [JobStatus.IN_PROGRESS, JobStatus.PAUSED, JobStatus.AT_RISK, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [JobStatus.COMPLETED, JobStatus.PAUSED, JobStatus.AT_RISK, JobStatus.CANCELLED],
  [JobStatus.PAUSED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.AT_RISK]: [JobStatus.COMPLETED, JobStatus.PAUSED, JobStatus.CANCELLED],
  [JobStatus.ON_HOLD]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [],
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
    include: {
      // changedBy relation doesn't exist directly, use raw query approach
    },
    take: 50,
  },
  _count: { select: { attachments: true, deliverables: true } },
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: any, filters: JobFiltersDto) {
    const where: any = {};

    // Role-based scoping
    if (currentUser.role === Role.CLIENT) {
      where.clientId = currentUser.id;
    } else if (currentUser.role === Role.DESIGNER) {
      where.assignments = { some: { designerId: currentUser.id, isActive: true } };
    } else if (currentUser.role === Role.WORKFLOW_ADMIN) {
      // WA sees their stream's jobs
      const membership = await this.prisma.streamMember.findFirst({
        where: { userId: currentUser.id },
      });
      if (membership) where.streamId = membership.streamId;
    }
    // ADMIN sees all

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

    const jobs = await this.prisma.job.findMany({
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

    return jobs;
  }

  async findOne(id: string, currentUser: any) {
    const job = await this.prisma.job.findUnique({
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

    if (!job) throw new NotFoundException(`Job ${id} not found`);
    this.checkJobAccess(job, currentUser);
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
        clientId: currentUser.role === Role.CLIENT ? currentUser.id : currentUser.id,
        createdById: currentUser.id,
      },
      include: {
        stream: { select: { id: true, name: true, colorHex: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Log initial status history
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
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    const allowed = STATUS_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${job.status} to ${dto.status}. Allowed: ${allowed.join(', ')}`,
      );
    }

    const updateData: any = {
      status: dto.status,
      rejectionReason: dto.status === JobStatus.REJECTED ? dto.reason : undefined,
      completedAt: dto.status === JobStatus.COMPLETED ? new Date() : undefined,
    };

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

    return updatedJob;
  }

  async delegate(id: string, dto: DelegateJobDto, currentUser: any) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

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

  // Cron: every hour, flag jobs within AT_RISK_THRESHOLD_HOURS of deadline
  @Cron(CronExpression.EVERY_HOUR)
  async flagAtRiskJobs() {
    const thresholdHours = 24;
    const thresholdDate = new Date();
    thresholdDate.setHours(thresholdDate.getHours() + thresholdHours);

    const atRiskJobs = await this.prisma.job.findMany({
      where: {
        isAtRisk: false,
        deadline: { lte: thresholdDate, gte: new Date() },
        status: { in: [JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.PAUSED] },
      },
    });

    for (const job of atRiskJobs) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { isAtRisk: true, atRiskNotifiedAt: new Date(), status: JobStatus.AT_RISK },
      });
      this.logger.warn(`Job ${job.jobNumber} flagged as AT_RISK`);
    }

    if (atRiskJobs.length > 0) {
      this.logger.log(`Flagged ${atRiskJobs.length} jobs as AT_RISK`);
    }
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
