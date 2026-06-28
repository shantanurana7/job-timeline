import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService, AiResponse } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mock OpenAI (Groq) ───────────────────────────────────────────────────────

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  job: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'GROQ_API_KEY') return 'test-key';
    if (key === 'GROQ_MODEL') return 'llama3-test-model';
    return undefined;
  }),
};

// ─── Response helpers ─────────────────────────────────────────────────────────

function textResponse(content: string) {
  return { choices: [{ message: { content, tool_calls: null } }] };
}

function toolCallResponse(name: string, args: Record<string, unknown>, content: string | null = null) {
  return {
    choices: [{
      message: {
        content,
        tool_calls: [{
          id: 'call-001',
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        }],
      },
    }],
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_JOB = {
  id: 'job-uuid-001',
  jobNumber: 'JB-2026-0001',
  title: 'Nike Campaign',
  status: 'ACCEPTED',
  priority: 'HIGH',
  deadline: new Date('2026-07-15'),
  isAtRisk: false,
  stream: { name: 'Brand' },
};

const MOCK_DESIGNER = {
  id: 'designer-uuid-001',
  firstName: 'Alex',
  lastName: 'Chen',
  _count: { assignments: 1 },
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AiService', () => {
  let service: AiService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  afterAll(() => module.close());

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.job.findMany.mockResolvedValue([MOCK_JOB]);
    mockPrisma.user.findMany.mockResolvedValue([MOCK_DESIGNER]);
  });

  // ── Text-only response ─────────────────────────────────────────────────────

  it('returns a text reply when the model responds with no tool call', async () => {
    mockCreate.mockResolvedValue(textResponse('You have 1 active job.'));

    const result: AiResponse = await service.processQuery('user-1', 'ADMIN', 'How many jobs?', []);

    expect(result.reply).toBe('You have 1 active job.');
    expect(result.proposal).toBeUndefined();
  });

  // ── assign_designer_to_job tool call ──────────────────────────────────────

  it('returns a proposal when the model calls assign_designer_to_job', async () => {
    mockCreate.mockResolvedValue(toolCallResponse('assign_designer_to_job', {
      jobId: 'job-uuid-001',
      jobNumber: 'JB-2026-0001',
      designerId: 'designer-uuid-001',
      designerName: 'Alex Chen',
      startTime: '2026-07-01T09:00:00Z',
      endTime: '2026-07-15T17:00:00Z',
    }));

    const result = await service.processQuery('user-1', 'ADMIN', 'Assign Alex to JB-2026-0001', []);

    expect(result.proposal).toBeDefined();
    expect(result.proposal!.action).toBe('assign_designer_to_job');
    expect(result.proposal!.payload.jobId).toBe('job-uuid-001');
    expect(result.proposal!.payload.designerId).toBe('designer-uuid-001');
    expect(result.proposal!.payload.designerName).toBe('Alex Chen');
    expect(result.proposal!.payload.startTime).toBe('2026-07-01T09:00:00Z');
    expect(result.proposal!.payload.endTime).toBe('2026-07-15T17:00:00Z');
  });

  // ── change_job_status tool call ───────────────────────────────────────────

  it('returns a proposal when the model calls change_job_status', async () => {
    mockCreate.mockResolvedValue(toolCallResponse('change_job_status', {
      jobId: 'job-uuid-001',
      jobNumber: 'JB-2026-0001',
      newStatus: 'IN_PROGRESS',
    }));

    const result = await service.processQuery('user-1', 'ADMIN', 'Move JB-2026-0001 to IN_PROGRESS', []);

    expect(result.proposal).toBeDefined();
    expect(result.proposal!.action).toBe('change_job_status');
    expect(result.proposal!.payload.jobId).toBe('job-uuid-001');
    expect(result.proposal!.payload.newStatus).toBe('IN_PROGRESS');
  });

  // ── Proposal has id and expiresAt ──────────────────────────────────────────

  it('proposal contains a non-empty id and future expiresAt', async () => {
    mockCreate.mockResolvedValue(toolCallResponse('change_job_status', {
      jobId: 'j1',
      jobNumber: 'JB-2026-0001',
      newStatus: 'ACCEPTED',
    }));

    const result = await service.processQuery('user-1', 'ADMIN', 'Accept JB-2026-0001', []);

    expect(result.proposal!.id).toBeTruthy();
    expect(result.proposal!.id).toMatch(/^[0-9a-f-]{36}$/);
    const expires = new Date(result.proposal!.expiresAt).getTime();
    expect(expires).toBeGreaterThan(Date.now());
  });

  // ── message.content alongside tool call used as reasoning ─────────────────

  it('uses message.content as the reply when the model provides both text and a tool call', async () => {
    mockCreate.mockResolvedValue(toolCallResponse(
      'change_job_status',
      { jobId: 'j1', jobNumber: 'JB-2026-0001', newStatus: 'COMPLETED' },
      "I'll move that job for you.",
    ));

    const result = await service.processQuery('user-1', 'ADMIN', 'Complete JB-2026-0001', []);

    expect(result.reply).toBe("I'll move that job for you.");
    expect(result.proposal).toBeDefined();
  });

  // ── Graceful error handling ────────────────────────────────────────────────

  it('returns a safe error reply when the API throws', async () => {
    mockCreate.mockRejectedValue(new Error('Network timeout'));

    const result = await service.processQuery('user-1', 'ADMIN', 'Do something', []);

    expect(result.reply).toContain('trouble connecting');
    expect(result.proposal).toBeUndefined();
  });

  // ── Context queries are run in parallel ───────────────────────────────────

  it('calls job.findMany and user.findMany exactly once per invocation', async () => {
    mockCreate.mockResolvedValue(textResponse('OK'));

    await service.processQuery('user-1', 'ADMIN', 'Hello', []);

    expect(mockPrisma.job.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  // ── DESIGNER context is filtered ──────────────────────────────────────────

  it('filters jobs to assignments for DESIGNER role', async () => {
    mockCreate.mockResolvedValue(textResponse('OK'));

    await service.processQuery('designer-uuid-001', 'DESIGNER', 'My jobs?', []);

    const jobQuery = mockPrisma.job.findMany.mock.calls[0][0];
    expect(jobQuery.where).toHaveProperty('assignments');
    expect(jobQuery.where.assignments).toMatchObject({
      some: { designerId: 'designer-uuid-001', isActive: true },
    });
  });

  // ── ADMIN context is not filtered ─────────────────────────────────────────

  it('does NOT filter by assignments for ADMIN role', async () => {
    mockCreate.mockResolvedValue(textResponse('OK'));

    await service.processQuery('admin-uuid-001', 'ADMIN', 'All jobs?', []);

    const jobQuery = mockPrisma.job.findMany.mock.calls[0][0];
    expect(jobQuery.where).not.toHaveProperty('assignments');
  });
});
