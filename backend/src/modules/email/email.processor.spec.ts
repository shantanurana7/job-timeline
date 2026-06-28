import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EmailProcessor } from './email.processor';
import { EMAIL_TRANSPORTER } from './email.constants';
import { JobCompletedEmailData } from './email.service';

// ─── Mock transporter ─────────────────────────────────────────────────────────

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-test-001' });
const mockTransporter = { sendMail: mockSendMail };

const mockConfig = {
  get: jest.fn((key: string, fallback?: string) => {
    if (key === 'SMTP_FROM') return '"Job Timeline" <noreply@jobtimeline.local>';
    return fallback;
  }),
};

// ─── Fixture ──────────────────────────────────────────────────────────────────

const EMAIL_DATA: JobCompletedEmailData = {
  to: 'client@acme.local',
  clientName: 'Alice Smith',
  jobNumber: 'JB-2026-0042',
  jobTitle: 'Nike Summer Campaign',
};

function makeJob(name: string, data: JobCompletedEmailData): Job<JobCompletedEmailData> {
  return { name, data } as Job<JobCompletedEmailData>;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EMAIL_TRANSPORTER, useValue: mockTransporter },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
  });

  afterAll(() => module.close());
  beforeEach(() => jest.clearAllMocks());

  // ── Routing ───────────────────────────────────────────────────────────────

  it('calls sendMail when job name is "job-completed"', async () => {
    await processor.process(makeJob('job-completed', EMAIL_DATA));

    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('does NOT call sendMail for unknown job names', async () => {
    await processor.process(makeJob('unknown-type', EMAIL_DATA));

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  // ── sendMail options ─────────────────────────────────────────────────────

  it('sends to the correct recipient email address', async () => {
    await processor.process(makeJob('job-completed', EMAIL_DATA));

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'client@acme.local' }),
    );
  });

  it('subject line contains the job number', async () => {
    await processor.process(makeJob('job-completed', EMAIL_DATA));

    const { subject } = mockSendMail.mock.calls[0][0];
    expect(subject).toContain('JB-2026-0042');
  });

  it('reads the from address from ConfigService', async () => {
    await processor.process(makeJob('job-completed', EMAIL_DATA));

    const { from } = mockSendMail.mock.calls[0][0];
    expect(from).toBe('"Job Timeline" <noreply@jobtimeline.local>');
  });

  // ── HTML template ─────────────────────────────────────────────────────────

  it('HTML body contains the client name', async () => {
    await processor.process(makeJob('job-completed', EMAIL_DATA));

    const { html } = mockSendMail.mock.calls[0][0];
    expect(html).toContain('Alice Smith');
  });

  it('HTML body contains the job number', async () => {
    await processor.process(makeJob('job-completed', EMAIL_DATA));

    const { html } = mockSendMail.mock.calls[0][0];
    expect(html).toContain('JB-2026-0042');
  });

  it('HTML body contains the job title', async () => {
    await processor.process(makeJob('job-completed', EMAIL_DATA));

    const { html } = mockSendMail.mock.calls[0][0];
    expect(html).toContain('Nike Summer Campaign');
  });

  // ── Error propagation ────────────────────────────────────────────────────

  it('propagates sendMail errors so BullMQ can retry the job', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    await expect(
      processor.process(makeJob('job-completed', EMAIL_DATA)),
    ).rejects.toThrow('SMTP connection refused');
  });
});
