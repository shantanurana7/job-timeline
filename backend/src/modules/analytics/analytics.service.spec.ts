import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  stream: { findMany: jest.fn() },
  job: { groupBy: jest.fn() },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STREAM_BRAND = { id: 'stream-brand', name: 'Brand', colorHex: '#6366f1' };
const STREAM_DIGITAL = { id: 'stream-digital', name: 'Digital', colorHex: '#f59e0b' };

function makeGroupByRow(streamId: string, status: JobStatus, count: number) {
  return { streamId, status, _count: { _all: count } };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AnalyticsService.getStreamThroughput()', () => {
  let service: AnalyticsService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterAll(() => module.close());

  beforeEach(() => jest.clearAllMocks());

  // ── Query shape ────────────────────────────────────────────────────────────

  it('fetches only stream metadata (no jobs relation) and delegates counting to groupBy', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([STREAM_BRAND]);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    await service.getStreamThroughput();

    // stream.findMany must NOT include the jobs relation
    const streamCall = mockPrisma.stream.findMany.mock.calls[0][0];
    expect(streamCall).not.toHaveProperty('include');
    expect(streamCall.select).toEqual({ id: true, name: true, colorHex: true });
    expect(streamCall.where).toEqual({ isActive: true });
  });

  it('calls job.groupBy with correct by/where/_count arguments', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([]);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    await service.getStreamThroughput();

    expect(mockPrisma.job.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['streamId', 'status'],
        where: { streamId: { not: null } },
        _count: { _all: true },
      }),
    );
  });

  it('issues both queries in parallel — each called exactly once per invocation', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([]);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    await service.getStreamThroughput();

    expect(mockPrisma.stream.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.job.groupBy).toHaveBeenCalledTimes(1);
  });

  // ── Output correctness ─────────────────────────────────────────────────────

  it('correctly aggregates totalJobs, byStatus, completed, and atRisk for a stream with mixed statuses', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([STREAM_BRAND]);
    mockPrisma.job.groupBy.mockResolvedValue([
      makeGroupByRow('stream-brand', JobStatus.COMPLETED, 5),
      makeGroupByRow('stream-brand', JobStatus.IN_PROGRESS, 3),
      makeGroupByRow('stream-brand', JobStatus.AT_RISK, 1),
    ]);

    const result = await service.getStreamThroughput();

    expect(result).toHaveLength(1);
    const brand = result[0];

    expect(brand.id).toBe('stream-brand');
    expect(brand.name).toBe('Brand');
    expect(brand.colorHex).toBe('#6366f1');
    expect(brand.totalJobs).toBe(9); // 5 + 3 + 1
    expect(brand.completed).toBe(5);
    expect(brand.atRisk).toBe(1);
    expect(brand.byStatus).toEqual({
      COMPLETED: 5,
      IN_PROGRESS: 3,
      AT_RISK: 1,
    });
  });

  it('returns zeroed counts for a stream that has no jobs', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([STREAM_BRAND, STREAM_DIGITAL]);
    // Only Brand has jobs; Digital is absent from groupBy results
    mockPrisma.job.groupBy.mockResolvedValue([
      makeGroupByRow('stream-brand', JobStatus.SUBMITTED, 2),
    ]);

    const result = await service.getStreamThroughput();

    const digital = result.find((s) => s.id === 'stream-digital')!;
    expect(digital.totalJobs).toBe(0);
    expect(digital.completed).toBe(0);
    expect(digital.atRisk).toBe(0);
    expect(digital.byStatus).toEqual({});
  });

  it('totals all status counts correctly when a stream has many statuses', async () => {
    const allStatuses: JobStatus[] = [
      JobStatus.SUBMITTED, JobStatus.UNDER_REVIEW, JobStatus.ACCEPTED,
      JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.COMPLETED,
    ];
    mockPrisma.stream.findMany.mockResolvedValue([STREAM_BRAND]);
    mockPrisma.job.groupBy.mockResolvedValue(
      allStatuses.map((s) => makeGroupByRow('stream-brand', s, 10)),
    );

    const [brand] = await service.getStreamThroughput();

    expect(brand.totalJobs).toBe(allStatuses.length * 10); // 60
    expect(brand.completed).toBe(10);
  });

  it('ignores groupBy rows that somehow carry a null streamId', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([STREAM_BRAND]);
    mockPrisma.job.groupBy.mockResolvedValue([
      // null streamId row — must not crash or pollute the map
      { streamId: null, status: JobStatus.SUBMITTED, _count: { _all: 99 } },
      makeGroupByRow('stream-brand', JobStatus.COMPLETED, 4),
    ]);

    const [brand] = await service.getStreamThroughput();

    // Only the real Brand row counts
    expect(brand.totalJobs).toBe(4);
    expect(brand.completed).toBe(4);
  });

  it('returns an empty array when there are no active streams', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([]);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    const result = await service.getStreamThroughput();

    expect(result).toEqual([]);
  });

  it('preserves stream order from stream.findMany in the returned array', async () => {
    mockPrisma.stream.findMany.mockResolvedValue([STREAM_DIGITAL, STREAM_BRAND]);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    const result = await service.getStreamThroughput();

    expect(result[0].id).toBe('stream-digital');
    expect(result[1].id).toBe('stream-brand');
  });
});
