import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobStatus, JobPriority, Role } from '@prisma/client';

import { JobsService } from './jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailService } from '../email/email.service';
import { ChangeJobStatusDto, DelegateJobDto } from './dto/job.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(
  overrides: Partial<{
    id: string;
    jobNumber: string;
    title: string;
    status: JobStatus;
    priority: JobPriority;
    isAtRisk: boolean;
    delegationCount: number;
    streamId: string | null;
    clientId: string;
    deadline: Date | null;
  }> = {},
) {
  return {
    id: 'job-cuid-001',
    jobNumber: 'JB-2026-0001',
    title: 'Test Campaign',
    status: JobStatus.SUBMITTED,
    priority: JobPriority.MEDIUM,
    isAtRisk: false,
    delegationCount: 0,
    streamId: 'stream-cuid-001',
    clientId: 'client-cuid-001',
    deadline: null,
    ...overrides,
  };
}

const ADMIN_USER = { id: 'admin-cuid', email: 'admin@test.local', role: Role.ADMIN };
const WA_USER = { id: 'wa-cuid', email: 'wa@test.local', role: Role.WORKFLOW_ADMIN };

// ─── Mock providers ───────────────────────────────────────────────────────────
//
// Defined at module level so jest.clearAllMocks() resets them between tests
// without needing to recreate the NestJS DI container on every test.

const mockPrisma = {
  job: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  jobStatusHistory: { create: jest.fn() },
  jobDelegation: { create: jest.fn() },
  stream: { findUnique: jest.fn() },
  streamMember: { findFirst: jest.fn() },
  jobSequence: { upsert: jest.fn() },
  $transaction: jest.fn(),
};

const mockGateway = { broadcastJobUpdate: jest.fn() };
const mockWebhooks = { notifyAtRisk: jest.fn().mockResolvedValue(undefined) };
const mockEmail = { addJobCompletedEmail: jest.fn().mockResolvedValue(undefined) };

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('JobsService', () => {
  let service: JobsService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsGateway, useValue: mockGateway },
        { provide: WebhooksService, useValue: mockWebhooks },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: execute all Prisma ops in the array and return their resolved values
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // changeStatus() — state machine
  // ═══════════════════════════════════════════════════════════════════════════

  describe('changeStatus()', () => {
    // ── Valid transitions ────────────────────────────────────────────────────

    describe('valid transitions', () => {
      // Every pair listed here must be allowed by STATUS_TRANSITIONS.
      // If this table diverges from the service, a test will fail — that's the point.
      const VALID_PAIRS: [JobStatus, JobStatus][] = [
        [JobStatus.SUBMITTED,    JobStatus.UNDER_REVIEW],
        [JobStatus.SUBMITTED,    JobStatus.CANCELLED],
        [JobStatus.UNDER_REVIEW, JobStatus.ACCEPTED],
        [JobStatus.UNDER_REVIEW, JobStatus.REJECTED],
        [JobStatus.UNDER_REVIEW, JobStatus.CANCELLED],
        [JobStatus.ACCEPTED,     JobStatus.ASSIGNED],
        [JobStatus.ACCEPTED,     JobStatus.DELEGATED],
        [JobStatus.ACCEPTED,     JobStatus.CANCELLED],
        [JobStatus.REJECTED,     JobStatus.SUBMITTED],   // resubmit
        [JobStatus.DELEGATED,    JobStatus.ASSIGNED],
        [JobStatus.DELEGATED,    JobStatus.CANCELLED],
        [JobStatus.ASSIGNED,     JobStatus.IN_PROGRESS],
        [JobStatus.ASSIGNED,     JobStatus.PAUSED],
        [JobStatus.ASSIGNED,     JobStatus.AT_RISK],
        [JobStatus.ASSIGNED,     JobStatus.CANCELLED],
        [JobStatus.IN_PROGRESS,  JobStatus.COMPLETED],
        [JobStatus.IN_PROGRESS,  JobStatus.PAUSED],
        [JobStatus.IN_PROGRESS,  JobStatus.AT_RISK],
        [JobStatus.IN_PROGRESS,  JobStatus.CANCELLED],
        [JobStatus.PAUSED,       JobStatus.IN_PROGRESS],
        [JobStatus.PAUSED,       JobStatus.CANCELLED],
        [JobStatus.AT_RISK,      JobStatus.COMPLETED],
        [JobStatus.AT_RISK,      JobStatus.PAUSED],
        [JobStatus.AT_RISK,      JobStatus.CANCELLED],
        [JobStatus.ON_HOLD,      JobStatus.IN_PROGRESS],
        [JobStatus.ON_HOLD,      JobStatus.CANCELLED],
      ];

      test.each<[JobStatus, JobStatus]>(VALID_PAIRS)(
        '%s → %s resolves without throwing',
        async (fromStatus, toStatus) => {
          const job = makeJob({ status: fromStatus });
          mockPrisma.job.findUnique.mockResolvedValue(job);
          mockPrisma.job.update.mockResolvedValue({ ...job, status: toStatus });
          mockPrisma.jobStatusHistory.create.mockResolvedValue({});

          const result = await service.changeStatus(
            job.id,
            { status: toStatus } as ChangeJobStatusDto,
            ADMIN_USER,
          );

          expect(result.status).toBe(toStatus);
          expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        },
      );
    });

    // ── Terminal states ──────────────────────────────────────────────────────

    describe('terminal state transitions', () => {
      it.each([JobStatus.COMPLETED, JobStatus.CANCELLED])(
        'throws BadRequestException when source status is terminal (%s)',
        async (terminalStatus) => {
          mockPrisma.job.findUnique.mockResolvedValue(makeJob({ status: terminalStatus }));

          await expect(
            service.changeStatus('job-cuid-001', { status: JobStatus.SUBMITTED } as ChangeJobStatusDto, ADMIN_USER),
          ).rejects.toThrow(BadRequestException);

          expect(mockPrisma.$transaction).not.toHaveBeenCalled();
          expect(mockGateway.broadcastJobUpdate).not.toHaveBeenCalled();
        },
      );
    });

    // ── Illegal skips ────────────────────────────────────────────────────────

    describe('invalid (skipped) transitions', () => {
      const INVALID_PAIRS: [JobStatus, JobStatus][] = [
        [JobStatus.SUBMITTED,    JobStatus.COMPLETED],
        [JobStatus.SUBMITTED,    JobStatus.IN_PROGRESS],
        [JobStatus.SUBMITTED,    JobStatus.ASSIGNED],
        [JobStatus.UNDER_REVIEW, JobStatus.COMPLETED],
        [JobStatus.UNDER_REVIEW, JobStatus.IN_PROGRESS],
        [JobStatus.ACCEPTED,     JobStatus.COMPLETED],
        [JobStatus.ACCEPTED,     JobStatus.IN_PROGRESS],
        [JobStatus.IN_PROGRESS,  JobStatus.SUBMITTED],
        [JobStatus.IN_PROGRESS,  JobStatus.UNDER_REVIEW],
      ];

      test.each<[JobStatus, JobStatus]>(INVALID_PAIRS)(
        '%s → %s throws BadRequestException',
        async (fromStatus, toStatus) => {
          mockPrisma.job.findUnique.mockResolvedValue(makeJob({ status: fromStatus }));

          await expect(
            service.changeStatus('job-cuid-001', { status: toStatus } as ChangeJobStatusDto, ADMIN_USER),
          ).rejects.toThrow(BadRequestException);
        },
      );

      it('error message lists the allowed transitions', async () => {
        mockPrisma.job.findUnique.mockResolvedValue(makeJob({ status: JobStatus.IN_PROGRESS }));

        let caught: BadRequestException | undefined;
        try {
          await service.changeStatus(
            'job-cuid-001',
            { status: JobStatus.SUBMITTED } as ChangeJobStatusDto,
            ADMIN_USER,
          );
        } catch (e) {
          caught = e as BadRequestException;
        }

        expect(caught).toBeInstanceOf(BadRequestException);
        const msg = (caught!.getResponse() as { message: string }).message;
        // Message should name at least one valid next status so the caller can act
        expect(msg).toContain('COMPLETED');
      });
    });

    // ── Data mutations ───────────────────────────────────────────────────────

    describe('data mutations on specific transitions', () => {
      it('sets completedAt when transitioning to COMPLETED', async () => {
        const job = makeJob({ status: JobStatus.IN_PROGRESS });
        mockPrisma.job.findUnique.mockResolvedValue(job);
        mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.COMPLETED });
        mockPrisma.jobStatusHistory.create.mockResolvedValue({});

        await service.changeStatus(job.id, { status: JobStatus.COMPLETED } as ChangeJobStatusDto, ADMIN_USER);

        const updateArg = mockPrisma.job.update.mock.calls[0][0];
        expect(updateArg.data.completedAt).toBeInstanceOf(Date);
      });

      it('does NOT set completedAt for non-COMPLETED transitions', async () => {
        const job = makeJob({ status: JobStatus.SUBMITTED });
        mockPrisma.job.findUnique.mockResolvedValue(job);
        mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.UNDER_REVIEW });
        mockPrisma.jobStatusHistory.create.mockResolvedValue({});

        await service.changeStatus(job.id, { status: JobStatus.UNDER_REVIEW } as ChangeJobStatusDto, ADMIN_USER);

        const updateArg = mockPrisma.job.update.mock.calls[0][0];
        expect(updateArg.data.completedAt).toBeUndefined();
      });

      it('sets rejectionReason when transitioning to REJECTED', async () => {
        const job = makeJob({ status: JobStatus.UNDER_REVIEW });
        mockPrisma.job.findUnique.mockResolvedValue(job);
        mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.REJECTED });
        mockPrisma.jobStatusHistory.create.mockResolvedValue({});

        await service.changeStatus(
          job.id,
          { status: JobStatus.REJECTED, reason: 'Out of scope' } as ChangeJobStatusDto,
          ADMIN_USER,
        );

        const updateArg = mockPrisma.job.update.mock.calls[0][0];
        expect(updateArg.data.rejectionReason).toBe('Out of scope');
      });

      it('does NOT set rejectionReason for non-REJECTED transitions', async () => {
        const job = makeJob({ status: JobStatus.SUBMITTED });
        mockPrisma.job.findUnique.mockResolvedValue(job);
        mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.UNDER_REVIEW });
        mockPrisma.jobStatusHistory.create.mockResolvedValue({});

        await service.changeStatus(
          job.id,
          { status: JobStatus.UNDER_REVIEW, reason: 'Should be ignored' } as ChangeJobStatusDto,
          ADMIN_USER,
        );

        const updateArg = mockPrisma.job.update.mock.calls[0][0];
        expect(updateArg.data.rejectionReason).toBeUndefined();
      });
    });

    // ── Transaction integrity ────────────────────────────────────────────────

    describe('transaction integrity', () => {
      it('writes both job update and status history in a single $transaction call', async () => {
        const job = makeJob({ status: JobStatus.SUBMITTED });
        mockPrisma.job.findUnique.mockResolvedValue(job);
        mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.UNDER_REVIEW });
        mockPrisma.jobStatusHistory.create.mockResolvedValue({});

        await service.changeStatus(
          job.id,
          { status: JobStatus.UNDER_REVIEW, reason: 'Received' } as ChangeJobStatusDto,
          ADMIN_USER,
        );

        // $transaction called exactly once with an array of 2 ops
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        const txOps = mockPrisma.$transaction.mock.calls[0][0];
        expect(Array.isArray(txOps)).toBe(true);
        expect(txOps).toHaveLength(2);
      });

      it('writes the correct history record fields', async () => {
        const job = makeJob({ status: JobStatus.SUBMITTED });
        mockPrisma.job.findUnique.mockResolvedValue(job);
        mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.CANCELLED });
        mockPrisma.jobStatusHistory.create.mockResolvedValue({});

        await service.changeStatus(
          job.id,
          { status: JobStatus.CANCELLED, reason: 'Client withdrew' } as ChangeJobStatusDto,
          WA_USER,
        );

        expect(mockPrisma.jobStatusHistory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              jobId: job.id,
              fromStatus: JobStatus.SUBMITTED,
              toStatus: JobStatus.CANCELLED,
              changedById: WA_USER.id,
              reason: 'Client withdrew',
            }),
          }),
        );
      });
    });

    // ── Side effects ─────────────────────────────────────────────────────────

    describe('side effects', () => {
      it('broadcasts the updated job via NotificationsGateway after a successful transition', async () => {
        const job = makeJob({ status: JobStatus.ASSIGNED });
        const updatedJob = { ...job, status: JobStatus.IN_PROGRESS };
        mockPrisma.job.findUnique.mockResolvedValue(job);
        mockPrisma.job.update.mockResolvedValue(updatedJob);
        mockPrisma.jobStatusHistory.create.mockResolvedValue({});

        await service.changeStatus(
          job.id,
          { status: JobStatus.IN_PROGRESS } as ChangeJobStatusDto,
          ADMIN_USER,
        );

        expect(mockGateway.broadcastJobUpdate).toHaveBeenCalledTimes(1);
        expect(mockGateway.broadcastJobUpdate).toHaveBeenCalledWith(
          updatedJob.id,
          updatedJob.status,
          expect.objectContaining({ jobNumber: updatedJob.jobNumber }),
        );
      });

      it('does NOT broadcast when the transition is invalid', async () => {
        mockPrisma.job.findUnique.mockResolvedValue(makeJob({ status: JobStatus.COMPLETED }));

        await expect(
          service.changeStatus(
            'job-cuid-001',
            { status: JobStatus.SUBMITTED } as ChangeJobStatusDto,
            ADMIN_USER,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockGateway.broadcastJobUpdate).not.toHaveBeenCalled();
      });
    });

    // ── Error conditions ─────────────────────────────────────────────────────

    describe('error conditions', () => {
      it('throws NotFoundException when the job ID does not exist', async () => {
        mockPrisma.job.findUnique.mockResolvedValue(null);

        await expect(
          service.changeStatus(
            'nonexistent-id',
            { status: JobStatus.UNDER_REVIEW } as ChangeJobStatusDto,
            ADMIN_USER,
          ),
        ).rejects.toThrow(NotFoundException);

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // delegate()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('delegate()', () => {
    const TARGET_STREAM = { id: 'stream-cuid-002', name: 'Digital' };

    it('delegates the job successfully on the happy path', async () => {
      const job = makeJob({ status: JobStatus.ACCEPTED, delegationCount: 0, streamId: 'stream-cuid-001' });
      const updatedJob = { ...job, status: JobStatus.DELEGATED, delegationCount: 1 };

      mockPrisma.job.findUnique.mockResolvedValue(job);
      mockPrisma.stream.findUnique.mockResolvedValue(TARGET_STREAM);
      mockPrisma.job.update.mockResolvedValue(updatedJob);
      mockPrisma.jobDelegation.create.mockResolvedValue({});
      mockPrisma.jobStatusHistory.create.mockResolvedValue({});

      const result = await service.delegate(
        job.id,
        { toStreamId: TARGET_STREAM.id, reason: 'Better fit' } as DelegateJobDto,
        WA_USER,
      );

      expect(result.status).toBe(JobStatus.DELEGATED);
    });

    it('moves the job to the target stream and increments delegationCount atomically', async () => {
      const job = makeJob({ status: JobStatus.ACCEPTED, delegationCount: 1, streamId: 'stream-cuid-001' });
      mockPrisma.job.findUnique.mockResolvedValue(job);
      mockPrisma.stream.findUnique.mockResolvedValue(TARGET_STREAM);
      mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.DELEGATED });
      mockPrisma.jobDelegation.create.mockResolvedValue({});
      mockPrisma.jobStatusHistory.create.mockResolvedValue({});

      await service.delegate(job.id, { toStreamId: TARGET_STREAM.id } as DelegateJobDto, WA_USER);

      const jobUpdateArg = mockPrisma.job.update.mock.calls[0][0];
      expect(jobUpdateArg.data.streamId).toBe(TARGET_STREAM.id);
      expect(jobUpdateArg.data.status).toBe(JobStatus.DELEGATED);
      expect(jobUpdateArg.data.delegationCount).toEqual({ increment: 1 });
    });

    it('writes a JobDelegation record with the correct hop number', async () => {
      const job = makeJob({ status: JobStatus.ACCEPTED, delegationCount: 1, streamId: 'stream-cuid-001' });
      mockPrisma.job.findUnique.mockResolvedValue(job);
      mockPrisma.stream.findUnique.mockResolvedValue(TARGET_STREAM);
      mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.DELEGATED });
      mockPrisma.jobDelegation.create.mockResolvedValue({});
      mockPrisma.jobStatusHistory.create.mockResolvedValue({});

      await service.delegate(
        job.id,
        { toStreamId: TARGET_STREAM.id, reason: 'Capacity' } as DelegateJobDto,
        WA_USER,
      );

      expect(mockPrisma.jobDelegation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobId: job.id,
            fromStreamId: 'stream-cuid-001',
            toStreamId: TARGET_STREAM.id,
            delegatedById: WA_USER.id,
            hopNumber: 2,           // delegationCount (1) + 1
            reason: 'Capacity',
          }),
        }),
      );
    });

    it('wraps the job update, delegation record, and history in one $transaction', async () => {
      const job = makeJob({ status: JobStatus.ACCEPTED, delegationCount: 0 });
      mockPrisma.job.findUnique.mockResolvedValue(job);
      mockPrisma.stream.findUnique.mockResolvedValue(TARGET_STREAM);
      mockPrisma.job.update.mockResolvedValue({ ...job, status: JobStatus.DELEGATED });
      mockPrisma.jobDelegation.create.mockResolvedValue({});
      mockPrisma.jobStatusHistory.create.mockResolvedValue({});

      await service.delegate(job.id, { toStreamId: TARGET_STREAM.id } as DelegateJobDto, WA_USER);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const txOps = mockPrisma.$transaction.mock.calls[0][0];
      expect(txOps).toHaveLength(3); // job.update + delegation.create + history.create
    });

    it('throws BadRequestException when delegationCount has already reached 3', async () => {
      mockPrisma.job.findUnique.mockResolvedValue(makeJob({ status: JobStatus.ACCEPTED, delegationCount: 3 }));

      await expect(
        service.delegate('job-cuid-001', { toStreamId: TARGET_STREAM.id } as DelegateJobDto, WA_USER),
      ).rejects.toThrow(BadRequestException);

      // Guard must fire before any DB writes
      expect(mockPrisma.stream.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the job does not exist', async () => {
      mockPrisma.job.findUnique.mockResolvedValue(null);

      await expect(
        service.delegate('nonexistent', { toStreamId: TARGET_STREAM.id } as DelegateJobDto, WA_USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the target stream does not exist', async () => {
      mockPrisma.job.findUnique.mockResolvedValue(makeJob({ status: JobStatus.ACCEPTED }));
      mockPrisma.stream.findUnique.mockResolvedValue(null);

      await expect(
        service.delegate('job-cuid-001', { toStreamId: 'ghost-stream' } as DelegateJobDto, WA_USER),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // flagAtRiskJobs() — cron
  // ═══════════════════════════════════════════════════════════════════════════

  describe('flagAtRiskJobs()', () => {
    it('queries only non-at-risk jobs in active statuses', async () => {
      mockPrisma.job.findMany.mockResolvedValue([]);

      await service.flagAtRiskJobs();

      const query = mockPrisma.job.findMany.mock.calls[0][0];
      expect(query.where.isAtRisk).toBe(false);
      expect(query.where.status.in).toEqual(
        expect.arrayContaining([JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.PAUSED]),
      );
      // Terminal statuses must NOT be included
      expect(query.where.status.in).not.toContain(JobStatus.COMPLETED);
      expect(query.where.status.in).not.toContain(JobStatus.CANCELLED);
    });

    it('flags each at-risk job: sets isAtRisk=true and status=AT_RISK', async () => {
      const nearDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now
      const jobs = [
        makeJob({ id: 'job-1', status: JobStatus.IN_PROGRESS, isAtRisk: false, deadline: nearDeadline }),
        makeJob({ id: 'job-2', status: JobStatus.ASSIGNED,    isAtRisk: false, deadline: nearDeadline }),
      ];
      mockPrisma.job.findMany.mockResolvedValue(jobs);
      mockPrisma.job.update.mockResolvedValue({});

      await service.flagAtRiskJobs();

      expect(mockPrisma.job.update).toHaveBeenCalledTimes(2);

      for (const job of jobs) {
        expect(mockPrisma.job.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: job.id },
            data: expect.objectContaining({
              isAtRisk: true,
              status: JobStatus.AT_RISK,
              atRiskNotifiedAt: expect.any(Date),
            }),
          }),
        );
      }
    });

    it('does nothing when no jobs are approaching their deadline', async () => {
      mockPrisma.job.findMany.mockResolvedValue([]);

      await service.flagAtRiskJobs();

      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });

    it('is idempotent: the DB query already filters isAtRisk=false so already-flagged jobs are never re-updated', async () => {
      // Simulate: one already-flagged job and one new at-risk job
      // The query must have WHERE isAtRisk = false, so only the new one comes back
      const newAtRiskJob = makeJob({ id: 'job-new', status: JobStatus.IN_PROGRESS, isAtRisk: false });
      mockPrisma.job.findMany.mockResolvedValue([newAtRiskJob]); // already-flagged excluded by DB
      mockPrisma.job.update.mockResolvedValue({});

      await service.flagAtRiskJobs();

      expect(mockPrisma.job.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'job-new' } }),
      );
    });
  });
});
