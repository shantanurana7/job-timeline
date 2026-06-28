import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhooksService, AtRiskJobContext, DesignerAssignedContext } from './webhooks.service';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const AT_RISK_JOB: AtRiskJobContext = {
  jobNumber: 'JB-2026-0001',
  title: 'Nike Campaign',
  priority: 'HIGH',
  deadline: new Date('2026-07-15T00:00:00.000Z'),
  status: 'AT_RISK',
};

const DESIGNER_ASSIGNMENT: DesignerAssignedContext = {
  job: { jobNumber: 'JB-2026-0001', title: 'Nike Campaign' },
  designer: { firstName: 'Alex', lastName: 'Chen' },
  startTime: new Date('2026-07-01T09:00:00.000Z'),
  endTime: new Date('2026-07-15T17:00:00.000Z'),
};

const WEBHOOK_URL = 'https://hooks.slack.com/services/test/webhook';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WebhooksService', () => {
  let service: WebhooksService;
  let module: TestingModule;

  const buildModule = async (url: string | undefined) => {
    module = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'SLACK_WEBHOOK_URL' ? url : undefined)) },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  };

  afterEach(async () => {
    jest.clearAllMocks();
    await module?.close();
  });

  // ── Silent no-op when URL not configured ────────────────────────────────

  it('does NOT call fetch when SLACK_WEBHOOK_URL is not set', async () => {
    await buildModule(undefined);

    await service.notifyAtRisk(AT_RISK_JOB);
    await service.notifyDesignerAssigned(DESIGNER_ASSIGNMENT);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── AT_RISK payload ───────────────────────────────────────────────────────

  it('POSTs to the configured URL when notifyAtRisk is called', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await service.notifyAtRisk(AT_RISK_JOB);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('AT_RISK payload contains job number and title in the text fallback', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true });

    await service.notifyAtRisk(AT_RISK_JOB);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain('JB-2026-0001');
    expect(body.text).toContain('Nike Campaign');
  });

  it('AT_RISK payload has Block Kit blocks array with at least header and section', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true });

    await service.notifyAtRisk(AT_RISK_JOB);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(Array.isArray(body.blocks)).toBe(true);
    expect(body.blocks.some((b: { type: string }) => b.type === 'header')).toBe(true);
    expect(body.blocks.some((b: { type: string }) => b.type === 'section')).toBe(true);
  });

  it('AT_RISK section fields contain priority and deadline', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true });

    await service.notifyAtRisk(AT_RISK_JOB);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const section = body.blocks.find((b: { type: string }) => b.type === 'section');
    const allFieldText = (section.fields as Array<{ text: string }>).map(f => f.text).join(' ');

    expect(allFieldText).toContain('HIGH');
    expect(allFieldText).toContain('2026-07-15');
  });

  // ── Designer assigned payload ─────────────────────────────────────────────

  it('POSTs to the configured URL when notifyDesignerAssigned is called', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true });

    await service.notifyDesignerAssigned(DESIGNER_ASSIGNMENT);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('designer-assigned payload text fallback contains designer name and job number', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true });

    await service.notifyDesignerAssigned(DESIGNER_ASSIGNMENT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain('Alex Chen');
    expect(body.text).toContain('JB-2026-0001');
  });

  it('designer-assigned section fields contain start and end dates', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true });

    await service.notifyDesignerAssigned(DESIGNER_ASSIGNMENT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const section = body.blocks.find((b: { type: string }) => b.type === 'section');
    const allFieldText = (section.fields as Array<{ text: string }>).map(f => f.text).join(' ');

    expect(allFieldText).toContain('2026-07-01');
    expect(allFieldText).toContain('2026-07-15');
  });

  // ── Error resilience ─────────────────────────────────────────────────────

  it('does NOT throw when fetch rejects (network error)', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    await expect(service.notifyAtRisk(AT_RISK_JOB)).resolves.toBeUndefined();
    await expect(service.notifyDesignerAssigned(DESIGNER_ASSIGNMENT)).resolves.toBeUndefined();
  });

  it('does NOT throw when Slack returns a non-200 status', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(service.notifyAtRisk(AT_RISK_JOB)).resolves.toBeUndefined();
  });

  // ── Content-Type header ───────────────────────────────────────────────────

  it('sends Content-Type: application/json', async () => {
    await buildModule(WEBHOOK_URL);
    mockFetch.mockResolvedValue({ ok: true });

    await service.notifyAtRisk(AT_RISK_JOB);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
