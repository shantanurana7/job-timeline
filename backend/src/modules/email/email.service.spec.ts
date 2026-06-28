import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EmailService, JobCompletedEmailData } from './email.service';

// ─── Mock Queue ────────────────────────────────────────────────────────────────

const mockQueue = { add: jest.fn() };

// ─── Fixture ──────────────────────────────────────────────────────────────────

const EMAIL_DATA: JobCompletedEmailData = {
  to: 'client@acme.local',
  clientName: 'Alice Smith',
  jobNumber: 'JB-2026-0042',
  jobTitle: 'Nike Summer Campaign',
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('EmailService', () => {
  let service: EmailService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: getQueueToken('email'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterAll(() => module.close());
  beforeEach(() => jest.clearAllMocks());

  // ── Queue dispatch ────────────────────────────────────────────────────────

  it('calls queue.add with job name "job-completed"', async () => {
    mockQueue.add.mockResolvedValue({ id: 'q-001' });

    await service.addJobCompletedEmail(EMAIL_DATA);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'job-completed',
      EMAIL_DATA,
      expect.any(Object),
    );
  });

  it('passes all email fields in the queue payload', async () => {
    mockQueue.add.mockResolvedValue({ id: 'q-002' });

    await service.addJobCompletedEmail(EMAIL_DATA);

    const [, payload] = mockQueue.add.mock.calls[0];
    expect(payload).toMatchObject({
      to: 'client@acme.local',
      clientName: 'Alice Smith',
      jobNumber: 'JB-2026-0042',
      jobTitle: 'Nike Summer Campaign',
    });
  });

  it('configures 3 retry attempts with exponential backoff', async () => {
    mockQueue.add.mockResolvedValue({ id: 'q-003' });

    await service.addJobCompletedEmail(EMAIL_DATA);

    const [, , options] = mockQueue.add.mock.calls[0];
    expect(options.attempts).toBe(3);
    expect(options.backoff).toMatchObject({ type: 'exponential' });
  });

  it('sets removeOnComplete and removeOnFail to prevent queue bloat', async () => {
    mockQueue.add.mockResolvedValue({ id: 'q-004' });

    await service.addJobCompletedEmail(EMAIL_DATA);

    const [, , options] = mockQueue.add.mock.calls[0];
    expect(options.removeOnComplete).toBeDefined();
    expect(options.removeOnFail).toBeDefined();
  });

  // ── Error resilience ─────────────────────────────────────────────────────

  it('does NOT throw if queue.add rejects (Redis down scenario)', async () => {
    mockQueue.add.mockRejectedValue(new Error('Redis connection refused'));

    await expect(service.addJobCompletedEmail(EMAIL_DATA)).resolves.toBeUndefined();
  });
});
