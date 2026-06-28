# DEVELOPMENT_LOG.md — Engineering Journal

> Append-only log. Every completed feature or architectural decision adds an entry.
> Format: Date | Feature | Files | Decisions | Issues | Next Steps

---

## Entry Format

```markdown
### [DATE] — [FEATURE TITLE]
**Files modified:** list of key files
**What was done:** Short description
**Architecture decisions:** Why specific approaches were chosen
**Known issues / deviations:** Any compromises or gaps
**Next steps:** What should follow this work
```

---

## Log

---

### 2026-06-22 — Phase 0: Infrastructure & Data Model Bootstrapped

**Files modified:**
- `docker-compose.yml` (new)
- `backend/prisma/schema.prisma` (new)
- `backend/prisma/seed.ts` (new)
- `.env`, `.env.example` (new)

**What was done:**
Complete infrastructure bootstrapping. Containerized PostgreSQL 16, Redis 7, pgAdmin 4, RedisInsight, and MailHog via Docker Compose. Designed the full Prisma schema with 14 models covering all business entities: User, Stream, StreamMember, Job, JobAssignment, JobAssignmentHistory, JobStatusHistory, JobDelegation, Attachment, Deliverable, Notification, RefreshToken, AuditLog, Setting, JobSequence, AiConversation, AiMessage. Created a comprehensive seeder with 10 users (4 roles), 2 streams, 10 jobs at various statuses, assignments, and default settings.

**Architecture decisions:**
- PostgreSQL over MySQL: JSON support, better enum handling, row-level security for future multi-tenancy
- `tenantId` field on all models: single-tenant today, multi-tenant migration path preserved
- `JobSequence` model for atomic job number generation: prevents race conditions under concurrent writes
- `tokenFamily` in RefreshToken: enables detection of token reuse attacks
- Append-only design for `JobStatusHistory` and `AuditLog`: immutable audit trail

**Known issues / deviations:** None at this stage

**Next steps:** Phase 1 — Backend API implementation

---

### 2026-06-23 — Phase 1: Backend Core API

**Files modified:**
- `backend/src/main.ts` (new)
- `backend/src/app.module.ts` (new)
- `backend/src/modules/auth/*` (new)
- `backend/src/modules/users/*` (new)
- `backend/src/modules/streams/*` (new)
- `backend/src/modules/jobs/*` (new)
- `backend/src/modules/assignments/*` (new)
- `backend/src/common/*` (new)
- `backend/src/config/winston.config.ts` (new)

**What was done:**
Full NestJS backend API. Authentication with JWT + Argon2, refresh token rotation with reuse detection. Job state machine with 12 statuses and enforced valid transitions. Atomic job number generation (JB-YYYY-NNNN). Designer assignment with max-3 constraint, time windows, and auto-primary logic. Role-based access (ADMIN, WORKFLOW_ADMIN, DESIGNER, CLIENT) enforced both in guards and in service-layer DB queries. Global validation pipe, exception filter, Swagger UI (dev only), Helmet, CORS.

**Architecture decisions:**
- Argon2 over bcrypt: memory-hard algorithm, more resistant to GPU attacks
- Token family rotation: both refresh token storage and family tracking for reuse detection — SHA256 hash in DB (never plain token)
- State machine as a static `STATUS_TRANSITIONS` map: explicit whitelist approach prevents invalid transitions at type and runtime level
- Role-scoped queries in service layer (not just guards): defense in depth — attacker bypassing guard still sees scoped data
- Global `ValidationPipe` with `whitelist + forbidNonWhitelisted`: strips unknown fields and rejects unexpected payloads

**Known issues / deviations:**
- `ThrottlerModule` imported twice (TD-001) — second import overrides first
- `AuditLog` schema ready but module not implemented (TD-002)

**Next steps:** Phase 2 — Frontend foundation

---

### 2026-06-24 — Phase 2: Frontend Foundation & Design System

**Files modified:**
- `frontend/src/app/globals.css` (new — 549 lines)
- `frontend/src/app/layout.tsx` (new)
- `frontend/src/app/(app)/layout.tsx` (new)
- All page files under `frontend/src/app/` (new)
- `frontend/src/components/*` (new)
- `frontend/src/stores/*` (new)
- `frontend/src/services/*` (new)
- `frontend/src/types/index.ts` (new)
- `frontend/src/lib/utils.ts` (new)
- `frontend/src/hooks/useSocket.ts` (new)

**What was done:**
Complete Next.js frontend with a premium dark-mode design system. Custom CSS architecture with CSS variables (no Tailwind). Dashboard, jobs listing/detail, timeline view, admin pages. Zustand state management for auth and toasts. Axios client with auto-refresh interceptor. TypeScript types mirroring all backend DTOs. Role-aware sidebar navigation.

**Architecture decisions:**
- Custom CSS over Tailwind: fine-grained control required for the custom grid-based layout. A Tailwind approach was attempted and **fully reverted** because utility classes conflicted with the grid CSS. This decision is permanent.
- Single `globals.css` file: all styles in one place for maintainability at this project scale
- Zustand over Redux/Context: lighter weight, simpler API, good TypeScript support
- Access token in memory (Zustand) + refresh token in localStorage: balance of security and simplicity for local dev
- Route group `(app)` for protected routes: clean Next.js pattern for layout isolation

**Known issues / deviations:**
- `features/` directories created but left empty (TD-009)
- `/analytics` sidebar item points to non-existent page (TD-011)
- React Query installed but not used (TD-005)

**Next steps:** Phase 3 — Advanced integration

---

### 2026-06-25 — Phase 3: Analytics, WebSockets, AI, Attachments, Settings

**Files modified:**
- `backend/src/modules/notifications/notifications.gateway.ts` (new)
- `backend/src/modules/notifications/notifications.service.ts` (new)
- `backend/src/modules/ai/ai.service.ts` (new)
- `backend/src/modules/analytics/analytics.service.ts` (new)
- `backend/src/modules/attachments/attachments.service.ts` (new)
- `backend/src/modules/settings/settings.service.ts` (new)
- `frontend/src/app/(app)/ai/page.tsx` (updated)
- `frontend/src/app/(app)/notifications/page.tsx` (updated)
- `frontend/src/app/(app)/admin/streams/page.tsx` (updated)
- `frontend/src/app/(app)/admin/settings/page.tsx` (updated)

**What was done:**
Real-time notification system with Socket.io — personal rooms per user, admin broadcast room, JWT auth on handshake, initial unread count push. Gemini 2.5 Pro AI agent with per-user active job context injection, rate-limited to 10 req/60s. Analytics endpoints with role-scoped KPIs, designer workload, and stream throughput. Multer file upload with local disk storage, 50MB limit, soft-delete. Key-value settings store with secret field support.

**Architecture decisions:**
- Socket.io personal rooms (`user_{userId}`): scales to broadcasting to specific users without iterating all connections
- AI context from active jobs only: minimizes token usage while providing relevant context
- Gemini 2.5 Pro with temperature 0.7: balanced creative/deterministic responses suitable for advisory use
- Soft-delete for attachments (`isDeleted`): preserves audit trail, files not immediately removed from disk
- Analytics cached at 30s TTL: acceptable staleness for dashboard KPIs; reduces DB load

**Known issues / deviations:**
- Socket.io CORS still `origin: '*'` (TD-007) — security gap, needs fix before production
- AI conversation not persisted to DB despite `AiConversation/AiMessage` schema existing (TD — listed in AI_GUIDE.md)

**Next steps:** Phase 4 — Interactive Gantt chart + capacity warnings

---

### 2026-06-26 — Documentation Bootstrap (Lead Engineer Handover)

**Files created:**
- `CLAUDE.md` — Permanent operating manual
- `PROJECT_RULES.md` — Engineering rulebook
- `ARCHITECTURE.md` — System design with Mermaid diagrams
- `API_GUIDE.md` — Complete API reference
- `DATABASE_GUIDE.md` — Prisma schema documentation
- `COMPONENT_GUIDE.md` — Frontend component library
- `AI_GUIDE.md` — AI agent implementation guide
- `TESTING_GUIDE.md` — Testing strategy for Phase 5
- `SECURITY.md` — Security posture and hardening checklist
- `TECH_DEBT.md` — 15 tracked technical debt items
- `CHANGELOG.md` — Version history
- `DEVELOPMENT_LOG.md` — This file
- `CONTRIBUTING.md` — Contributor guide

**What was done:**
Full codebase audit across backend, frontend, and infrastructure. All 3 agent parallel discovery runs covering every module, service, component, CSS architecture, Prisma schema, and Docker configuration. Comparison against `future_plans.md` roadmap. Phase 0–3 verified complete. Phase 4–6 not started. 15 technical debt items identified and catalogued. All 13 documentation files created with project-specific content (no generic templates).

**Architecture decisions:**
- Documentation created at project root (not in `docs/` folder): maximum discoverability for future agents
- CLAUDE.md as living document: the single source of truth for every AI session
- TECH_DEBT.md with severity ratings: enables triage of fixes by impact

**Known issues discovered:**
- TD-001: ThrottlerModule double import
- TD-002: AuditModule empty
- TD-003: TimelineModule empty
- TD-004: Two Google AI SDKs installed
- TD-005: React Query unused
- TD-006: BullMQ unused
- TD-007: Socket.io CORS open
- TD-008: Refresh token in localStorage
- TD-009: Empty features/ directories
- TD-010: No tests
- TD-011: Missing /analytics page
- TD-012: No cache invalidation on writes
- TD-013: BigInt not globally serialized
- TD-014: Delegation bypasses changeStatus()
- TD-015: Missing /admin page.tsx

**Next steps:** Phase 4 — Gantt chart, drag-and-drop, capacity warnings

---

### 2026-06-26 — Phase 4: Interactive Gantt Chart & Capacity Warnings

**Files modified:**
- `frontend/src/app/(app)/timeline/page.tsx` — Full rewrite (~310 lines)
- `frontend/src/app/globals.css` — 130 new lines of Gantt-specific CSS classes

**What was done:**
Complete Phase 4 Gantt implementation: HTML5 native drag-and-drop reassignment, per-designer capacity utilization bars, overbooked warnings, and a reassignment confirmation modal. No new npm dependencies added — uses existing `date-fns` and `lucide-react`.

**Architecture decisions:**
- `draggedRef` (useRef) stores full drag context without triggering re-renders during drag events; separate `draggingId` (useState) drives opacity visual on the dragged bar — these two tracks serve different purposes.
- `getBarPos()` uses date math (not `findIndex`) so assignments that start before or end after the current week still render correctly as partial bars clipped to the visible window.
- Drag-drop only enabled for ADMIN and WORKFLOW_ADMIN roles — `canDrag` computed from `useAuthStore`.
- HTML5 `dataTransfer.setData('text/plain', id)` is required for Firefox to allow the drag operation.
- `onDragOver` sets drop target state (not `onDragEnter`/`onDragLeave`) to avoid flickering from child elements stealing events.
- Capacity is measured against a 9:00–17:00 (8h) standard work day. Uses actual time overlap, not just assignment existence on that day.
- Modal's `onConfirm` returns `boolean` — `true` means success (parent closes modal), `false` means failure (modal stays open with `setLoading(false)`).
- CSS classes follow BEM-style naming (`gantt-bar--dragging`, `gantt-row--droptarget`) and live in `globals.css` per project CSS rule (no Tailwind).

**Known issues / deviations:**
- Capacity calculation uses fixed 9:00–17:00 window, not per-designer `workHoursStart`/`workHoursEnd` — acceptable for now, future enhancement for Phase 5.
- After a successful reassignment, `load()` refetches the full week. A targeted optimistic update would be faster but more complex.

**Next steps:** TD-015 `/admin/page.tsx` redirect, TD-011 `/analytics` standalone page, then Phase 5 testing

---

---

### 2026-06-26 — Phase 5: Unit Tests (JobsService + AuthService)

**Files created:**
- `backend/src/modules/jobs/jobs.service.spec.ts` — 58 tests
- `backend/src/modules/auth/auth.service.spec.ts` — 17 tests

**What was done:**
First production tests for the platform. Covers the two highest-risk service layers: the state machine and the security-critical token rotation logic. All 76 tests (including the pre-existing scaffold) pass in ~3 seconds. Zero real database or network calls — all dependencies mocked via `@nestjs/testing` + inline mock objects.

**Architecture decisions:**
- `jest.mock('argon2')` at file top, not `jest.spyOn`: `argon2` is a native addon and its `verify` property is non-configurable — `spyOn` throws `TypeError: Cannot redefine property`. Module-level mock intercepts at load time instead.
- `beforeAll` for NestJS `TestingModule` creation, `beforeEach` for `jest.clearAllMocks()`: avoids recreating the DI container for every test (significant speed improvement) while still resetting call counts and return values between tests.
- `mockPrisma.$transaction.mockImplementation((ops) => Promise.all(ops))`: executes the actual Prisma calls (which are themselves mocked) and returns their resolved values — correctly simulates the array-form Prisma transaction without needing real DB.
- `test.each` for all 26 valid state transitions and 9 invalid ones: parametric tests are self-documenting and catch regressions if the `STATUS_TRANSITIONS` map changes.
- Default `argon2.verify` set to `true` in `beforeEach`; individual tests override with `(argon2.verify as jest.Mock).mockResolvedValue(false)` where needed.

**Known issues / deviations:**
- `generateJobNumber()` (private) not tested directly — tested indirectly through `create()`. Could be extracted and exposed for testing in a future refactor.
- `AssignmentsService` unit tests not yet written — next priority after Playwright setup.

**Next steps:** Playwright E2E setup + `auth.spec.ts` + `job-lifecycle.spec.ts`

---

### 2026-06-26 — Phase 5: Playwright E2E Tests

**Files created:**
- `frontend/playwright.config.ts` — Playwright configuration (Chromium, reuseExistingServer, single-worker serial)
- `frontend/e2e/fixtures/users.ts` — Seeded credential constants for all 4 roles
- `frontend/e2e/helpers/login.ts` — Reusable UI login helper (`goto + fill + click + waitForURL`)
- `frontend/e2e/auth.spec.ts` — 6 auth tests
- `frontend/e2e/job-lifecycle.spec.ts` — 7 lifecycle tests

**Files modified:**
- `frontend/package.json` — Added `test:e2e`, `test:e2e:ui`, `test:e2e:report` scripts

**What was done:**
Playwright E2E test suite covering the two critical user journeys: authentication (login, wrong credentials, logout, protected-route redirect, all roles) and the full job lifecycle (CLIENT submits → ADMIN reviews → accepts → assigns → starts → completes → status history verified). Tests are written as `test.describe.serial` sharing a module-level `jobId` variable captured from the redirect URL after job creation.

**Architecture decisions:**
- `workers: 1` and `fullyParallel: false`: the lifecycle tests depend on sequential DB state mutations; parallelism would cause race conditions and test ordering failures.
- `reuseExistingServer: true`: tests run against the already-running dev server (Docker + backend + frontend must be up). Prevents a redundant dev server spin-up during development.
- Login flow repeated per test (no shared storageState file): avoids complexity of managing Zustand in-memory access token across browser contexts. Login is fast (<1s) so this is acceptable.
- `page.locator('#id')` over `getByLabel` for form inputs: these fields have explicit IDs (confirmed by reading the source), making selectors stable against label text changes.
- `test.describe.serial` with module-level `let jobId`: simpler than Playwright fixtures or storage files for sharing state between steps in a single sequential flow.
- Status assertions use `.badge` + `.filter({ hasText })` + `.first()`: more readable than CSS class selectors and resilient to HTML structure changes in surrounding layout.

**Known issues / deviations:**
- E2E tests require the backend, frontend, and PostgreSQL containers to be running before execution. CI pipeline configuration is Phase 6 scope.
- Designer role cannot change job status in the current UI (`canChangeStatus` is ADMIN/WA only). Lifecycle test uses ADMIN for all status transitions.
- Stream selection uses `{ index: 1 }` which is brittle if the seed data changes. Future improvement: look up stream ID via API in a fixture.

**Next steps:** Data Export (CSV/PDF) endpoints + frontend download buttons, then `AssignmentsService` unit tests

---

### 2026-06-26 — Phase 5: Data Export (CSV) + Analytics Page

**Files created:**
- `backend/src/modules/analytics/dto/export-query.dto.ts` — `ExportQueryDto` (optional `format` field)
- `frontend/src/app/(app)/analytics/page.tsx` — Analytics page: stream throughput table, designer workload grid, CSV export button

**Files modified:**
- `backend/src/modules/analytics/analytics.service.ts` — Added `exportJobsCsv(user)` (Prisma query + field mapping) and private `toCsv()` CSV builder (no external dependency)
- `backend/src/modules/analytics/analytics.controller.ts` — Added `GET /analytics/export` endpoint; refactored imports for `StreamableFile`, `Roles`, `RolesGuard`, `CurrentUser`
- `frontend/src/services/index.ts` — Added `analyticsApi.exportJobs(format)` returning full AxiosResponse with `responseType: 'blob'`

**What was done:**
CSV export of all jobs for ADMIN/WORKFLOW_ADMIN. Backend builds CSV in-memory (no library dependency) via a private `toCsv()` method that escapes values per RFC 4180 (double-quotes, CRLF line endings). Controller returns a `StreamableFile` with `Content-Disposition: attachment` — no JSON wrapper since this is a file download. Frontend captures the blob, creates an object URL, and programmatically clicks a temporary anchor to trigger the download. TD-011 (missing /analytics page) resolved as a side-effect.

**Architecture decisions:**
- No `json2csv` dependency — manual CSV building is ~20 lines and handles all edge cases (commas, embedded quotes, newlines) for our flat data structure. Zero risk of ESM/CJS compatibility issues.
- `StreamableFile` over `@Res()` with `res.send()` — the NestJS idiomatic approach; does not bypass interceptors, works cleanly with the global exception filter.
- `analyticsApi.exportJobs()` returns the full AxiosResponse (not `.data`) — the only service function that deviates from the `.then(r => r.data)` pattern. Necessary because the caller needs the blob, not a parsed JS object.
- `Readable.from([csv])` passes the CSV string as a single chunk — more efficient than `Readable.from(csv)` (which would emit one character per chunk since strings are iterable).
- CSV format only for now — PDF is Phase 6 scope (requires pdfkit or similar, layout decisions, and pagination logic).

**Known issues / deviations:**
- PDF export not implemented — the `/analytics/export` endpoint accepts `?format=pdf` without error but still returns CSV. Add `@IsIn(['csv'])` validation and PDF generation when PDF is needed.

**Next steps:** Query optimization (`getStreamThroughput` groupBy fix), then `AssignmentsService` unit tests

---

### 2026-06-26 — Phase 5: Query Optimization — getStreamThroughput()

**Files modified:**
- `backend/src/modules/analytics/analytics.service.ts` — Replaced JS-side counting with two parallel Prisma queries

**Files created:**
- `backend/src/modules/analytics/analytics.service.spec.ts` — 9 unit tests

**What was done:**
Refactored `getStreamThroughput()` to replace the O(total_jobs) memory pattern with a two-query strategy that runs in parallel. PostgreSQL now does all counting via `GROUP BY streamId, status`. Memory usage for this method drops from O(jobs) to O(streams × statuses).

**Architecture decisions:**
- `Promise.all([stream.findMany, job.groupBy])` — both queries are independent and run in parallel; net latency is `max(stream_query, job_query)` instead of `stream_query + job_query`
- `stream.findMany` uses `select` instead of the old `include` — drops the `jobs` and `_count.jobs` relations entirely; only fetches the 3 fields needed for the output shape
- `job.groupBy({ by: ['streamId', 'status'], where: { streamId: { not: null } }, _count: { _all: true } })` — single PostgreSQL `SELECT stream_id, status, COUNT(*) GROUP BY stream_id, status` replaces loading all job rows; result is O(streams × statuses) regardless of total job count
- `Map<streamId, Record<status, count>>` for joining — O(groupBy_rows) build cost, O(1) per-stream lookup in the final `map()` call; no nested loops
- `totalJobs` computed via `Object.values(byStatus).reduce(sum)` — derived from the already-fetched counts, no extra DB query

**Test coverage decisions:**
- "query shape" tests assert `stream.findMany` has no `include` property and `job.groupBy` uses the correct `by`/`where`/`_count` shape — catches regressions if someone re-introduces the old pattern
- "null streamId guard" test provides a null-streamId row in the mock and verifies it is silently skipped — defends against edge cases where the WHERE filter still lets one through (e.g., Prisma adapter quirk)
- "stream order preserved" test verifies the return order matches the stream.findMany result — important for frontend rendering stability

**Test results:** 85/85 tests pass (9 new + 76 pre-existing)

**Next steps:** Phase 5 complete. Remaining backlog: AssignmentsService unit tests (Phase 6), TD-015 /admin page redirect, production hardening items

---

### 2026-06-27 — Phase 6 Part 1: Action-Oriented AI (Tool Calling)

**Files created:**
- `backend/src/modules/ai/dto/chat.dto.ts` — `ChatDto` + `HistoryEntryDto` with class-validator decorators
- `backend/src/modules/ai/ai.service.spec.ts` — 9 unit tests
- `frontend/src/components/ui/ProposalCard.tsx` — Confirm/Dismiss card for AI proposals

**Files modified:**
- `backend/src/modules/ai/ai.service.ts` — Full rewrite with Gemini function calling, context injection, proposal builder
- `backend/src/modules/ai/ai.controller.ts` — Uses `ChatDto`, `@CurrentUser()`, `ApiResponse.ok()`
- `frontend/src/types/index.ts` — Replaced stale `AiActionProposal` with accurate `action`/`payload` shape
- `frontend/src/services/index.ts` — Typed `aiApi.chat()` return; added `HistoryEntry` interface
- `frontend/src/app/(app)/ai/page.tsx` — Integrated `ProposalCard`; `handleConfirm` calls `assignmentsApi.assign()` or `jobsApi.changeStatus()`
- `frontend/src/app/globals.css` — Added `.proposal-card` CSS block

**What was done:**
Upgraded the Gemini AI agent from read-only to action-capable. The agent now declares two Gemini function-calling tools (`assign_designer_to_job`, `change_job_status`). On each query the service fetches active jobs (role-scoped) and available designers (both with UUIDs) and injects them into the system prompt so Gemini can populate tool call arguments with real IDs. When Gemini triggers a function call the service builds an `AiActionProposal` object (with UUID + 10-minute expiry) and returns it alongside the reply text. The frontend renders a `ProposalCard` inside the assistant bubble; the user confirms or dismisses; confirmation calls the existing REST API under the user's own JWT, so all authorization rules apply.

**Architecture decisions:**
- "Proposal, Not Execution" pattern — AI service never directly calls `assignmentsApi` or `changeStatus()`; it builds a data object; the frontend executes against the existing API. This means `RolesGuard` and `JwtAuthGuard` on the assignment/jobs endpoints protect against privilege escalation even if the AI is compromised.
- Context injection — Active job IDs and designer IDs are injected into the system prompt so the model can populate exact UUIDs; without this, the model would hallucinate IDs.
- `randomUUID()` from Node.js built-in `crypto` — zero-dependency, no UUID package version concerns.
- `expiresAt` set to `Date.now() + 10 minutes` — proposals are transient (not persisted to DB in Phase 6); the expiry is informational; the frontend doesn't enforce it yet.
- Controller fixed to use `ApiResponse.ok()` — the AI controller was the only one not using the standard wrapper; now consistent with the rest of the API. Frontend `aiApi.chat()` updated to read `res.data.reply` and `res.data.proposal`.

**Test results:** 94/94 tests pass (9 new AI service tests + 85 pre-existing)

**Next steps:** Phase 6 Part 2 — Slack/Teams webhook integration (`WebhooksService` firing on AT_RISK flag + new designer assignment)

---

### 2026-06-27 — Phase 6 Part 2: Slack Webhook Integration

**Files created:**
- `backend/src/modules/webhooks/webhooks.service.ts` — `WebhooksService` with `notifyAtRisk()` and `notifyDesignerAssigned()` methods
- `backend/src/modules/webhooks/webhooks.module.ts` — standalone module exporting `WebhooksService`
- `backend/src/modules/webhooks/webhooks.service.spec.ts` — 11 unit tests

**Files modified:**
- `backend/src/modules/jobs/jobs.module.ts` — imports `WebhooksModule`
- `backend/src/modules/jobs/jobs.service.ts` — injects `WebhooksService`; fire-and-forget call in `flagAtRiskJobs()`
- `backend/src/modules/jobs/jobs.service.spec.ts` — adds mock `WebhooksService` to providers
- `backend/src/modules/assignments/assignments.module.ts` — imports `WebhooksModule`
- `backend/src/modules/assignments/assignments.service.ts` — injects `WebhooksService`; fire-and-forget call in `assign()`
- `.env.example` — added `SLACK_WEBHOOK_URL` with documentation comment

**What was done:**
Created a standalone `WebhooksModule` that sends Slack Block Kit formatted messages to an incoming webhook URL. Two triggers: `JobsService.flagAtRiskJobs()` fires `notifyAtRisk` when a job's deadline crosses the 24-hour threshold; `AssignmentsService.assign()` fires `notifyDesignerAssigned` after a successful assignment. Both calls are fire-and-forget (`void` expression) so they never delay the API response or the cron job. The service silently no-ops if `SLACK_WEBHOOK_URL` is not set in env, making the integration completely optional.

**Architecture decisions:**
- Standalone `WebhooksModule` not folded into `NotificationsModule` — Slack webhooks are an outbound external integration; internal notifications (WebSocket + DB) are a separate concern. Keeping them separate means adding a Teams webhook later is one file.
- Minimal context interfaces (`AtRiskJobContext`, `DesignerAssignedContext`) — the service accepts plain typed objects, not Prisma entities. This avoids coupling `WebhooksService` to the Prisma schema and makes tests trivial.
- Native `fetch` only — no new dependencies. Available globally in Node.js 18+ with `@types/node` v24.
- `void` fire-and-forget — the Promise is started but its rejection is never surfaced to the caller. `notifyAtRisk` / `notifyDesignerAssigned` always catch all errors internally and log them, so the Promise returned is always resolved, never rejected.
- Block Kit `text` fallback field — required by Slack for push notification preview. Blocks alone are insufficient.

**Test results:** 105/105 tests pass (11 new + 94 pre-existing)

**Next steps:** Phase 6 complete. Phase 7 roadmap: production SMTP, client portal, action AI conversation persistence (DB-backed `AiConversation` → currently transient)

---

### 2026-06-27 — Phase 6 Part 3: BullMQ Email Queue (SMTP via nodemailer)

**Files created:**
- `backend/src/modules/email/email.constants.ts` — `EMAIL_TRANSPORTER` injection token
- `backend/src/modules/email/email.service.ts` — enqueues `job-completed` BullMQ jobs; exports `JobCompletedEmailData` interface
- `backend/src/modules/email/email.processor.ts` — `@Processor('email')` / `WorkerHost`; nodemailer transporter injected via token; inline HTML template
- `backend/src/modules/email/email.module.ts` — `BullModule.registerQueue('email')` + factory provider for nodemailer transporter
- `backend/src/modules/email/email.service.spec.ts` — 5 unit tests
- `backend/src/modules/email/email.processor.spec.ts` — 9 unit tests

**Files modified:**
- `backend/src/modules/jobs/jobs.module.ts` — imports `EmailModule`
- `backend/src/modules/jobs/jobs.service.ts` — injects `EmailService`; `changeStatus()` fetches client email via `include`; fires `void addJobCompletedEmail()` on COMPLETED transition
- `backend/src/modules/jobs/jobs.service.spec.ts` — adds mock `EmailService` provider
- `backend/package.json` — `@types/nodemailer` added to devDependencies

**What was done:**
Wired up BullMQ's existing Redis infrastructure to an email queue. `EmailService.addJobCompletedEmail()` enqueues a `'job-completed'` job with 3 retry attempts and exponential back-off. `EmailProcessor` processes queue jobs by calling nodemailer `sendMail()` with an inline-styled HTML template. The trigger is `changeStatus()` in `JobsService`: when a job transitions to COMPLETED, the client's email and name are fetched (via the single `include` added to the existing `findUnique`) and the email is dispatched fire-and-forget. SMTP settings are read from `ConfigService`; when `SMTP_USER` is absent (MailHog), auth is omitted.

**Architecture decisions:**
- `EMAIL_TRANSPORTER` injection token — creating the transporter in a NestJS factory provider (rather than in the processor's constructor) makes the processor trivially testable: tests just pass `{ sendMail: jest.fn() }` as the token's value. Without this pattern, mocking nodemailer requires hoisted `jest.mock('nodemailer')` with tricky module-scope variable sharing.
- Error propagation in `EmailProcessor.process()` — unlike `WebhooksService`, the processor DOES propagate errors. BullMQ catches thrown errors from `process()` and automatically retries the job up to `attempts` times. Swallowing errors here would silence retries.
- Error swallowing in `EmailService.addJobCompletedEmail()` — the queue dispatch (Redis write) is the one place where failure should not fail the API response. If Redis is down, we log an error and return cleanly.
- `import * as nodemailer` namespace import — required because the tsconfig uses `isolatedModules: true` + `emitDecoratorMetadata: true`. A named `import { Transporter }` of a type in a decorated constructor parameter triggers TS error 1272. Namespace imports are explicitly allowed.

**Test results:** 119/119 tests pass (14 new + 105 pre-existing). Zero TypeScript errors.

**Next steps:** Phase 6 complete. All three objectives done: Action-Oriented AI, Slack Webhooks, Production Email. Phase 7: client portal, action AI conversation persistence, production SMTP.

---

*This log is append-only. Do not edit previous entries.*
