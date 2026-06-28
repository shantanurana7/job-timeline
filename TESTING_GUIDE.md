# TESTING_GUIDE.md — Testing Strategy

> Phase 5 in progress. Unit tests complete. Playwright E2E complete.

---

## 1. Current State

**Testing infrastructure installed:**
- `jest` — unit + integration test runner (backend)
- `supertest` — HTTP integration testing
- `jest-e2e.json` — E2E test configuration
- `@playwright/test` — browser E2E testing (frontend)

**Tests written:**

| File | Tests | Scope |
|------|-------|-------|
| `backend/src/modules/jobs/jobs.service.spec.ts` | 58 | State machine, delegation, cron flag |
| `backend/src/modules/auth/auth.service.spec.ts` | 17 | Login, token rotation, family revocation, logout |
| `backend/src/modules/analytics/analytics.service.spec.ts` | 9 | getStreamThroughput — groupBy query shape, aggregation, zero-job streams, null-streamId guard |
| `backend/src/modules/ai/ai.service.spec.ts` | 9 | Tool calling — text reply, assign_designer_to_job proposal, change_job_status proposal, UUID/expiry shape, mixed parts, error handling, parallel context queries, DESIGNER vs ADMIN scope |
| `backend/src/modules/webhooks/webhooks.service.spec.ts` | 11 | Slack webhooks — no-op when unconfigured, AT_RISK Block Kit payload shape, designer-assigned payload, network error resilience, non-200 status, Content-Type header |
| `backend/src/modules/email/email.service.spec.ts` | 5 | EmailService — queue dispatch with correct job name, payload fidelity, retry options, queue-bloat prevention, Redis-down resilience |
| `backend/src/modules/email/email.processor.spec.ts` | 9 | EmailProcessor — sendMail called on job-completed, unknown job name no-op, recipient, subject, from address, HTML content (name/number/title), sendMail error propagates for BullMQ retry |
| `backend/test/app.e2e-spec.ts` | 1 | NestJS scaffold (pre-existing) |
| `frontend/e2e/auth.spec.ts` | 6 | Login, wrong credentials, logout, redirect guard |
| `frontend/e2e/job-lifecycle.spec.ts` | 7 | Full lifecycle: SUBMITTED → UNDER_REVIEW → ACCEPTED → ASSIGNED → IN_PROGRESS → COMPLETED |

**Run backend unit tests:** `cd backend && npm test`
**Run backend with coverage:** `cd backend && npm run test:cov`
**Run E2E tests (requires running dev servers):** `cd frontend && npm run test:e2e`
**Run E2E with interactive UI:** `cd frontend && npm run test:e2e:ui`

**Priority order for Phase 5:**
1. Unit tests for `JobsService` state machine (highest risk, highest value)
2. Unit tests for `AuthService` token rotation logic
3. Integration tests for job lifecycle APIs
4. E2E tests with Playwright for critical user journeys

---

## 2. Backend Testing Strategy

### 2.1 Unit Tests — Service Layer

Test business logic in isolation. Mock Prisma and all external dependencies.

**What to unit test:**
- `JobsService.changeStatus()` — all valid and invalid transitions
- `JobsService.generateJobNumber()` — format and uniqueness logic
- `JobsService.flagAtRiskJobs()` — threshold calculation
- `AuthService.refresh()` — token reuse detection, family revocation
- `AuthService.generateTokens()` — token format, expiry, family assignment
- `AssignmentsService.assign()` — max-3 constraint, isPrimary auto-set
- `AssignmentsService.unassign()` — history creation logic

**Pattern:**
```typescript
// backend/src/modules/jobs/__tests__/jobs.service.spec.ts

describe('JobsService', () => {
  let service: JobsService
  let prisma: DeepMockProxy<PrismaClient>

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: mockDeep<PrismaClient>() }
      ],
    }).compile()

    service = module.get(JobsService)
    prisma = module.get(PrismaService)
  })

  describe('changeStatus', () => {
    it('should allow SUBMITTED → UNDER_REVIEW transition', async () => {
      prisma.job.findUnique.mockResolvedValue({ status: 'SUBMITTED', ...mockJob })
      prisma.job.update.mockResolvedValue({ ...mockJob, status: 'UNDER_REVIEW' })
      prisma.jobStatusHistory.create.mockResolvedValue({})

      const result = await service.changeStatus(jobId, { status: 'UNDER_REVIEW' }, mockUser)
      expect(result.status).toBe('UNDER_REVIEW')
    })

    it('should throw BadRequestException for invalid transition', async () => {
      prisma.job.findUnique.mockResolvedValue({ status: 'COMPLETED', ...mockJob })

      await expect(
        service.changeStatus(jobId, { status: 'IN_PROGRESS' }, mockUser)
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException for all invalid transitions', async () => {
      const invalidTransitions = [
        { from: 'SUBMITTED', to: 'IN_PROGRESS' },
        { from: 'COMPLETED', to: 'CANCELLED' },
        { from: 'CANCELLED', to: 'SUBMITTED' },
      ]

      for (const { from, to } of invalidTransitions) {
        prisma.job.findUnique.mockResolvedValue({ status: from, ...mockJob })
        await expect(
          service.changeStatus(jobId, { status: to }, mockUser)
        ).rejects.toThrow(BadRequestException)
      }
    })
  })

  describe('generateJobNumber', () => {
    it('should generate JB-YEAR-NNNN format', async () => {
      const year = new Date().getFullYear()
      prisma.jobSequence.upsert.mockResolvedValue({ sequence: 1, year })
      const num = await service.generateJobNumber()
      expect(num).toBe(`JB-${year}-0001`)
    })

    it('should pad sequence to 4 digits', async () => {
      prisma.jobSequence.upsert.mockResolvedValue({ sequence: 42, year: 2024 })
      const num = await service.generateJobNumber()
      expect(num).toMatch(/JB-\d{4}-0042/)
    })
  })
})
```

---

### 2.2 Integration Tests — API Layer

Test full HTTP request/response cycle with a real test database.

**Setup:** Use a separate test PostgreSQL database (`job_timeline_test_db`).

```typescript
// backend/test/jobs.e2e-spec.ts

describe('Jobs API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let adminToken: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    // Apply same pipes/filters as production
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalFilters(new AllExceptionsFilter())
    app.setGlobalPrefix('api')
    await app.init()

    prisma = moduleRef.get(PrismaService)

    // Seed test user + login
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'Admin1234!' })
    adminToken = loginRes.body.data.accessToken
  })

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "Job" CASCADE`
    await app.close()
  })

  it('POST /api/jobs should create a job with auto-generated jobNumber', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Job', description: 'Test description', priority: 'MEDIUM' })

    expect(res.status).toBe(201)
    expect(res.body.data.jobNumber).toMatch(/^JB-\d{4}-\d{4}$/)
    expect(res.body.data.status).toBe('SUBMITTED')
  })

  it('PATCH /api/jobs/:id/status should reject invalid transition', async () => {
    const job = await prisma.job.findFirst()
    const res = await request(app.getHttpServer())
      .patch(`/api/jobs/${job.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })  // Invalid from SUBMITTED

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/jobs should be role-scoped for CLIENT', async () => {
    // Login as client
    const clientLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'client@test.local', password: 'Password1234!' })
    const clientToken = clientLogin.body.data.accessToken

    // Create a job as another user
    // Client should only see their own jobs
    const res = await request(app.getHttpServer())
      .get('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    // All returned jobs should have clientId = client's ID
    res.body.data.forEach(job => {
      expect(job.client.id).toBe(clientLogin.body.data.user.id)
    })
  })
})
```

---

### 2.3 Critical Test Matrix

The following scenarios must have test coverage before Phase 5 ships:

**Auth:**
| Scenario | Type |
|----------|------|
| Login with valid credentials | Integration |
| Login with wrong password | Integration |
| Login with deactivated account | Integration |
| Refresh with valid token | Integration |
| Refresh with revoked token → 403 | Integration |
| Refresh with reused revoked token → family revoked | Unit |
| Logout revokes token | Integration |

**Jobs State Machine (all 12 states × valid/invalid transitions):**
| Scenario | Type |
|----------|------|
| All valid transitions succeed | Unit |
| All invalid transitions throw | Unit |
| COMPLETED → any throws (terminal) | Unit |
| CANCELLED → any throws (terminal) | Unit |
| Status history entry created on change | Unit |
| Job completedAt set on COMPLETED | Unit |

**Assignments:**
| Scenario | Type |
|----------|------|
| Assign designer — happy path | Integration |
| Assign 4th designer → 400 | Integration |
| First assignment is auto-primary | Unit |
| isPrimary=true unsets others | Unit |
| Unassign creates history record | Unit |

**Role-Based Access:**
| Scenario | Type |
|----------|------|
| CLIENT sees only own jobs | Integration |
| DESIGNER sees only assigned jobs | Integration |
| WORKFLOW_ADMIN sees only stream jobs | Integration |
| ADMIN sees all jobs | Integration |
| DESIGNER cannot change job status | Integration |
| CLIENT cannot assign designers | Integration |

---

## 3. Frontend Testing Strategy (Phase 5)

### 3.1 E2E Testing with Playwright

Install Playwright separately (not included in current deps).

**Critical user journeys to test:**

1. **Job Submission Flow**
   ```
   Login as CLIENT → Navigate to /jobs/new → Fill form → Submit → 
   Assert redirect to /jobs/[id] → Assert status = SUBMITTED
   ```

2. **Job Review & Assign Flow**
   ```
   Login as WORKFLOW_ADMIN → Navigate to /jobs →
   Open SUBMITTED job → Change status to UNDER_REVIEW → 
   Change to ACCEPTED → Assign designer →
   Assert designer receives notification
   ```

3. **Designer Work Flow**
   ```
   Login as DESIGNER → Navigate to /jobs → 
   See assigned job → Change to IN_PROGRESS → 
   Upload attachment → Mark COMPLETED
   ```

4. **AI Chat Flow**
   ```
   Login as DESIGNER → Navigate to /ai →
   Type message → Assert response rendered as Markdown
   ```

**Playwright configuration:**
```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'playwright/.auth/user.json',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
})
```

---

## 4. Test Environment Setup

**Environment variables for testing:**
```bash
# backend/.env.test
DATABASE_URL="postgresql://admin:localdev123@localhost:5432/job_timeline_test"
NODE_ENV=test
JWT_ACCESS_SECRET=test-access-secret
JWT_REFRESH_SECRET=test-refresh-secret
```

**Scripts to add to `backend/package.json`:**
```json
{
  "test:unit": "jest --testPathPattern=.spec.ts",
  "test:integration": "jest --config jest-e2e.json",
  "test:all": "npm run test:unit && npm run test:integration"
}
```

---

## 5. What NOT to Test

- Framework internals (NestJS routing, Prisma query syntax)
- Third-party library behavior (Argon2, JWT signing)
- Configuration loading (ConfigModule)
- Generated Prisma types

Focus testing on: **business logic that is custom to this application.**

---

*Last updated: 2026-06-26*
