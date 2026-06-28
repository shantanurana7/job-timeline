# CLAUDE.md — Permanent Operating Manual

> This file is the single source of truth for every AI session working on this repository.
> Read it completely before touching any code. It must never become stale.

---

## 1. Project Overview

**Job Assigning Timeline Management Platform** — an enterprise-grade, full-stack application that replaces spreadsheet-based job tracking with a centralized, real-time workflow platform.

**Stakeholders:**
- **Clients** — submit job requests
- **Workflow Admins** — review, accept, delegate, and assign jobs to streams
- **Designers** — receive assignments and execute work
- **Admins** — full system access, user/stream management, analytics

**Development strategy:** Zero-cost, local-first. Everything runs on Docker locally. No cloud billing during development. Free-tier AI (Gemini API via aistudio.google.com).

---

## 2. Technology Stack

### Backend
| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (TypeScript 5.7) |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma v7.8 (native PG adapter) |
| Cache | Redis 7 + cache-manager-ioredis |
| Queue | BullMQ 5 (Redis-backed, configured but not yet consumed) |
| Auth | JWT (Passport.js) + Argon2 password hashing |
| Real-time | Socket.io / WebSockets |
| AI | Google Gemini 2.5 Pro via `@google/genai` SDK |
| File uploads | Multer (local disk storage) |
| Logging | Winston + nest-winston |
| Scheduling | @nestjs/schedule (cron) |
| Rate limiting | @nestjs/throttler |
| API Docs | Swagger (dev only at `/api/docs`) |
| Validation | class-validator + class-transformer |

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.9 (App Router) |
| Language | TypeScript 5 |
| Styling | **Vanilla CSS only** — global CSS variables (NO Tailwind utility classes) |
| State | Zustand 5 |
| HTTP | Axios with interceptors |
| Real-time | socket.io-client |
| Forms | React Hook Form + Zod |
| Icons | lucide-react |
| Markdown | react-markdown (AI chat responses) |
| Date | date-fns |

### Infrastructure
| Service | Port | Purpose |
|---------|------|---------|
| NestJS Backend | 3001 | API + WebSocket server |
| Next.js Frontend | 3000 | Web application |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache + job queues |
| pgAdmin | 5050 | DB management UI |
| RedisInsight | 5540 | Redis management UI |
| MailHog | 8025 (UI), 1025 (SMTP) | Email testing |

---

## 3. Architecture Overview

```
Client Browser
      │
      ├──── HTTP/REST ──────► Next.js (port 3000)
      │                           │
      │                           ├── Axios API client ──► NestJS (port 3001)
      │                           │
      └──── WebSocket ────────────────────────────────────► Socket.io Gateway
                                                                     │
                                                            NestJS Domain Modules
                                                                     │
                                                            Prisma ──► PostgreSQL
                                                                     │
                                                            ioredis ──► Redis
                                                                     │
                                                            Gemini API ──► Google AI
```

**Key architectural patterns:**
- JWT Bearer tokens for REST auth (15m access / 7d refresh with rotation)
- WebSocket connection authenticated with same JWT on handshake
- Redis cache per-user (10s TTL for jobs list, 30s for analytics)
- Job state machine enforced server-side (never trust client status changes)
- Append-only audit trail via `JobStatusHistory`

---

## 4. Folder Structure

```
timeline/
├── docker-compose.yml          ← All infrastructure services
├── .env / .env.example         ← Environment configuration
├── CLAUDE.md                   ← This file
├── PROJECT_RULES.md            ← Engineering rulebook
├── ARCHITECTURE.md             ← Full system design + Mermaid diagrams
├── API_GUIDE.md                ← Complete API reference
├── DATABASE_GUIDE.md           ← Prisma schema documentation
├── COMPONENT_GUIDE.md          ← Frontend component library
├── AI_GUIDE.md                 ← AI agent implementation
├── TESTING_GUIDE.md            ← Testing strategy and examples
├── SECURITY.md                 ← Security practices
├── TECH_DEBT.md                ← Known issues and future cleanup
├── CHANGELOG.md                ← Version history
├── DEVELOPMENT_LOG.md          ← Engineering journal
├── CONTRIBUTING.md             ← Contributor guide
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       ← Database schema (16 models, 4 enums)
│   │   ├── seed.ts             ← Demo data seeder
│   │   └── migrations/         ← Migration history
│   └── src/
│       ├── main.ts             ← App bootstrap (Helmet, CORS, Swagger, pipes)
│       ├── app.module.ts       ← Root module (all imports)
│       ├── prisma/             ← PrismaService (global)
│       ├── config/
│       │   └── winston.config.ts
│       ├── common/
│       │   ├── decorators/     ← @CurrentUser, @Roles
│       │   ├── dto/            ← ApiResponse<T>
│       │   ├── filters/        ← AllExceptionsFilter
│       │   ├── guards/         ← RolesGuard
│       │   └── interceptors/   ← UserCacheInterceptor
│       └── modules/
│           ├── auth/           ← JWT login, refresh rotation
│           ├── users/          ← User CRUD + Argon2
│           ├── streams/        ← Team/department CRUD
│           ├── jobs/           ← State machine + cron AT_RISK flagging
│           ├── assignments/    ← Designer scheduling
│           ├── notifications/  ← WebSocket gateway + DB notifications
│           ├── analytics/      ← KPIs, workload, throughput
│           ├── attachments/    ← Multer file upload
│           ├── ai/             ← Gemini AI agent
│           ├── settings/       ← Key-value config store
│           ├── audit/          ← EMPTY (schema ready, no service yet)
│           └── timeline/       ← EMPTY (placeholder, handled by assignments)
│
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx      ← Root layout (ToastContainer)
        │   ├── page.tsx        ← Redirects to /dashboard
        │   ├── login/          ← Login page
        │   └── (app)/          ← Protected route group
        │       ├── layout.tsx  ← AuthProvider + Sidebar + Topbar
        │       ├── dashboard/
        │       ├── timeline/
        │       ├── jobs/       ← list, new, [id]
        │       ├── ai/
        │       ├── notifications/
        │       └── admin/
        │           ├── users/
        │           ├── streams/
        │           └── settings/
        ├── components/
        │   ├── layout/
        │   │   └── Sidebar.tsx ← Nav + role-based items + logout
        │   ├── providers/
        │   │   └── AuthProvider.tsx ← Auth init on mount
        │   └── ui/
        │       ├── Avatar.tsx
        │       ├── Badges.tsx  ← StatusBadge, PriorityBadge
        │       └── ToastContainer.tsx
        ├── hooks/
        │   └── useSocket.ts    ← Singleton Socket.io connection
        ├── services/
        │   ├── api.ts          ← Axios client + interceptors
        │   └── index.ts        ← All API endpoint functions
        ├── stores/
        │   ├── auth.store.ts   ← Zustand auth state
        │   └── toast.store.ts  ← Zustand toast queue
        ├── types/
        │   └── index.ts        ← All TypeScript interfaces
        ├── lib/
        │   └── utils.ts        ← cn, formatDate, getStatusLabel, etc.
        └── features/           ← EMPTY placeholder dirs (future refactor)
```

---

## 5. Coding Philosophy

**Think before typing.** Every change should be deliberate. Ask: "Does this fit the existing architecture? Does it introduce complexity? Will a future developer understand it without comments?"

**The five principles (in priority order):**
1. Correctness — code that does what it claims
2. Security — never introduce vulnerabilities
3. Readability — obvious code beats clever code
4. Performance — measure before optimizing
5. Completeness — proper loading/error/empty states on every surface

**What we do not do:**
- Introduce new frameworks or large dependencies
- Add Tailwind utility classes to any frontend file (see CSS section)
- Rewrite working modules
- Add features beyond what was asked
- Leave TODO comments in committed code
- Write console.log in production paths (use Winston logger)

---

## 6. Design Philosophy

This platform uses a **premium dark-mode aesthetic** built entirely with custom CSS. The design system was deliberately engineered without Tailwind to maintain precise grid-based layouts.

**Critical Rule:** Never add Tailwind utility classes (`text-sm`, `flex`, `p-4`, etc.) to frontend files. A previous attempt to introduce Tailwind broke the entire grid layout and had to be fully reverted.

**Design language:**
- Dark theme only (`--bg-base: #0d0f14`)
- Indigo accent (`--accent: #6366f1`)
- 8px/10px/14px/20px border radius scale
- Inter font family
- Subtle shadows (not flat, not heavy)
- Status colors mapped 1:1 to `JobStatus` enum values

**All CSS lives in one file:** `frontend/src/app/globals.css`

---

## 7. Naming Conventions

### Backend
- Files: `kebab-case.service.ts`, `kebab-case.controller.ts`, `kebab-case.module.ts`
- Classes: `PascalCase` (e.g., `JobsService`, `NotificationsGateway`)
- Variables: `camelCase`
- Prisma models: `PascalCase` singular (e.g., `Job`, `User`, `Stream`)
- Enums: `SCREAMING_SNAKE_CASE` values (e.g., `JobStatus.IN_PROGRESS`)
- DTOs: `PascalCaseDto` (e.g., `CreateJobDto`, `ChangeStatusDto`)
- Environment variables: `SCREAMING_SNAKE_CASE` (e.g., `JWT_ACCESS_SECRET`)

### Frontend
- Components: `PascalCase.tsx` files, `PascalCase` exports
- Pages: `page.tsx` (Next.js App Router convention)
- Hooks: `useHookName.ts` prefix
- Stores: `featureName.store.ts`
- API service functions: `resourceApi.action()` (e.g., `jobsApi.changeStatus()`)
- CSS classes: `kebab-case` following BEM-lite naming
- Type interfaces: `PascalCase` without `I` prefix (e.g., `User`, `Job`)

---

## 8. Coding Standards

### TypeScript
- Strict mode enabled on both backend and frontend
- No `any` unless unavoidable — use `unknown` and narrow
- Prefer `interface` over `type` for object shapes
- Always type function return values on service methods
- Use Prisma-generated types rather than duplicating

### Backend (NestJS)
- Every controller endpoint must have a corresponding DTO
- All DTOs use `class-validator` decorators (`@IsString()`, `@IsEnum()`, etc.)
- Use `@ApiProperty()` on all DTO fields for Swagger
- Services return plain objects or Prisma types (never Response objects)
- Controllers return `ApiResponse.ok(data)` for consistent wrapping
- Use `@CurrentUser()` decorator — never `req.user` directly
- Guards applied at controller class level where possible
- Never bypass `RolesGuard` — add the role, don't remove the guard

### Frontend (Next.js)
- All pages are `'use client'` (no Server Components currently in use)
- API calls via service layer only — never `fetch()` directly in components
- Loading state: always show spinner while async operations run
- Error state: always show user-facing error (use `toast.error()`)
- Empty state: always show meaningful empty state (not blank page)
- Forms: React Hook Form + Zod schema for all user input
- No direct DOM manipulation — use React state

---

## 9. UI Rules

1. **Never use Tailwind utility classes.** Use the CSS classes defined in `globals.css`.
2. Use CSS variables from `:root` for all colors — no hardcoded hex values in components.
3. Status colors: always use `.status-{STATUS_LOWERCASE}` CSS class (e.g., `.status-in_progress`).
4. Priority colors: always use `.priority-{PRIORITY_LOWERCASE}` CSS class.
5. Loading states: use `.spinner` or `.skeleton` classes from globals.
6. Empty states: use `.empty-state` + `.empty-state-icon` pattern.
7. Toast notifications: use `toast.success/error/warning/info()` from toast store.
8. Buttons: use `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost` classes.
9. Forms: use `.form-group`, `.form-label`, `.form-control`, `.form-error` classes.
10. Cards: use `.card` + `.card-body` classes.

---

## 10. Backend Rules

1. Every API route is protected by `JwtAuthGuard` unless explicitly public.
2. `@Roles()` decorator must accompany `RolesGuard` for role-restricted endpoints.
3. All job status transitions go through `JobsService.changeStatus()` — never update `job.status` directly.
4. Job numbers are generated atomically via `JobSequence` — never construct them manually.
5. Attach `JobStatusHistory` entries for every status change — transactional.
6. Sensitive config (secrets, API keys) must come from `ConfigService` — never hardcode.
7. Log all errors with `this.logger.error()` — never swallow exceptions silently.
8. Prisma queries: use `select` to avoid over-fetching; include related models only when needed.
9. File uploads: validate file type and size in Multer config, not just in service logic.
10. WebSocket events: emit from service layer via injected `NotificationsGateway`, not controllers.

---

## 11. Frontend Rules

1. Access token lives in memory only (Zustand `auth.store.ts`). Never write it to localStorage.
2. Refresh token lives in `localStorage` (key: `refreshToken`). The API client reads it on 401.
3. All API calls go through `frontend/src/services/index.ts` — never construct raw Axios calls in pages.
4. Role checks in pages use `user?.role === 'ADMIN'` — always use optional chaining.
5. Socket.io: use `useSocket()` hook — never instantiate `io()` directly in components.
6. Zustand stores: import `use{Store}Store` from store files — never import Zustand directly.
7. All date display goes through `formatDate()` or `formatRelativeTime()` from `lib/utils.ts`.
8. Status/priority labels go through `getStatusLabel()` / `getPriorityLabel()` from `lib/utils.ts`.
9. The `cn()` utility from `lib/utils.ts` is the correct way to compose conditional class names.
10. The `features/` directory is currently empty — do not add code there without first establishing the folder pattern.

---

## 12. Database Rules

1. Never write raw SQL — always use Prisma query methods.
2. All schema changes go through `prisma migrate dev` — never edit the database directly.
3. Multi-tenant fields use `tenantId` with default `"default"` — always include in queries.
4. `AuditLog` is append-only — never update or delete rows.
5. `JobStatusHistory` is append-only — never update or delete rows.
6. Soft deletes: `Attachment` and `Deliverable` use `isDeleted` flag — filter with `isDeleted: false`.
7. BigInt fields (`sizeBytes`): serialize to string before sending to frontend (Prisma returns BigInt).
8. Job number generation: use `prisma.jobSequence.upsert()` — never generate in application code.
9. Relationships: define in schema with explicit relation names when ambiguous.
10. Migrations: always review generated migration SQL before applying in production.

---

## 13. Testing Strategy

**Current state:** Jest and Supertest are installed. No tests exist yet.

**Priority order for Phase 5:**
1. Unit tests for `JobsService` state machine transitions (most critical)
2. Unit tests for `AuthService` token rotation logic
3. Integration tests for job lifecycle (submit → review → assign → complete)
4. E2E tests with Playwright for critical user journeys

See `TESTING_GUIDE.md` for full strategy.

---

## 14. Security Practices

**Active protections:**
- Helmet security headers (all responses)
- CORS locked to `FRONTEND_URL`
- Argon2 password hashing
- JWT with 15m access token lifetime
- Refresh token family reuse detection (revokes entire family on reuse)
- SHA256 hashing of stored refresh tokens (never store plain tokens)
- Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`
- `ThrottlerGuard` on all endpoints (100/60s general, 10/60s AI)

**Known gaps (see SECURITY.md):**
- Socket.io CORS set to `origin: '*'` instead of `FRONTEND_URL`
- No HTTPS in local dev
- No Content Security Policy configured
- Refresh token in localStorage (acceptable but HTTP-only cookie is safer)

---

## 15. Performance Expectations

- Jobs list: cached per-user at 10s TTL in Redis
- Analytics dashboard: cached at 30s TTL
- No other caching implemented yet
- BullMQ is configured but has no active queues — infrastructure ready
- Prisma native PG adapter used for connection pooling

---

## 16. Accessibility Rules

- Semantic HTML elements (`<button>`, `<nav>`, `<main>`, `<article>`)
- All interactive elements have visible focus states
- Color is never the only indicator of status (text labels always accompany badges)
- Form labels always associated with inputs via `htmlFor`/`id` pairing
- Error messages announced inline (not just via color change)

---

## 17. Reusable Component Philosophy

**Current reusable components** (in `frontend/src/components/`):
- `Avatar` — User avatar with initials fallback
- `StatusBadge` — Job status visual badge
- `PriorityBadge` — Job priority visual badge
- `ToastContainer` — Global notification toasts

**Philosophy:** Extract a component when it appears in 3+ places with identical logic. Prefer CSS classes over prop-based style variations. Components should not make API calls — data flows in via props.

---

## 18. AI Implementation Philosophy

The Gemini AI agent is intentionally **read-only** in Phase 3. It answers questions about jobs and workflow but does not execute actions. This is a deliberate safety boundary.

**Phase 6 roadmap:** Action-oriented AI ("Assign job X to designer Y") with a proposal → confirmation → execution flow using `AiActionProposal` type and the `AI_ACTION_PROPOSED` notification type already defined in the schema.

**Current AI model:** `gemini-2.5-pro` (configurable via `GEMINI_MODEL` env var)

**System prompt** injects active jobs context per user — keep prompts factual and bounded.

---

## 19. Development Workflow

### Every Code Change — Follow This Order:
1. Understand the request completely
2. Inspect affected files in the repository
3. Search for existing reusable code (`Grep` / `Glob`)
4. Plan the change (files affected, risks, approach)
5. Implement
6. Verify (does it work? does it break anything adjacent?)
7. Update relevant documentation (this file, API_GUIDE, etc.)
8. Append to `DEVELOPMENT_LOG.md`

### Common Commands

**Infrastructure:**
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f postgres
```

**Backend:**
```bash
cd backend

# Development (hot reload)
npm run start:dev

# Database migration
npm run migrate:dev

# Reset database + reseed
npm run migrate:reset && npm run seed

# Open Prisma Studio
npm run studio

# Production build
npm run build && npm run start:prod
```

**Frontend:**
```bash
cd frontend

# Development server
npm run dev

# Production build
npm run build && npm start
```

**Seeded Demo Credentials:**
```
Admin:           admin@jobtimeline.local      / Admin1234!
Workflow Admin:  wa.brand@jobtimeline.local   / Password1234!
Workflow Admin:  wa.digital@jobtimeline.local / Password1234!
Designer:        alex.chen@jobtimeline.local  / Password1234!
Client:          client.acme@jobtimeline.local / Password1234!
```

---

## 20. Known Architectural Decisions

| Decision | Reason |
|----------|--------|
| Custom CSS over Tailwind | Fine-grained control over premium dark grid layout. Previous Tailwind attempt broke layout. |
| JWT in memory, refresh in localStorage | Balances security and simplicity for local dev. Production should use HTTP-only cookies. |
| Local disk uploads (Multer) | Zero-cost local dev. Phase 5+ will migrate to S3 or equivalent. |
| Two Google AI SDKs installed | `@google/genai` (used, v2.10) and `@google/generative-ai` (unused). Remove `@google/generative-ai`. |
| ThrottlerModule imported twice | Bug in `app.module.ts` — two ThrottlerModule.forRoot() calls with different limits. The second (10/60s) wins. |
| BullMQ configured but unused | Infrastructure pre-wired for future async jobs (email, exports, reports). |
| AuditModule empty | Schema and enum ready. Service/controller not implemented. |
| TimelineModule empty | Functionality handled by `AssignmentsService.getAllDesignerSchedules()`. |
| React Query installed but unused | Currently all data fetching is manual Axios + useState. Migration is Phase 5 tech debt. |

---

## 21. Common Mistakes to Avoid

1. **Adding Tailwind classes** — will break the grid layout silently
2. **Hardcoding colors** — use CSS variables or this changes inconsistently across themes
3. **Updating job.status directly** — always use `changeStatus()` which enforces state machine + writes history
4. **Returning BigInt from Prisma** — `sizeBytes` is BigInt; always serialize to String before sending to frontend
5. **Forgetting role-scoped queries** — Jobs/analytics/users all have role-based visibility. Not applying it exposes data to unauthorized users.
6. **Skipping `ApiResponse.ok()` wrapper** — frontend expects `{ success, data }` format from every endpoint
7. **Creating a notification without a WebSocket event** — DB record + WS push are a pair
8. **Using `new Date().getFullYear()` for job numbers** — already done correctly in `generateJobNumber()`, don't duplicate it
9. **Forgetting `isDeleted: false` filter** — Attachment and Deliverable are soft-deleted
10. **Writing to `AuditLog` or `JobStatusHistory` directly** — these are append-only; never update existing rows

---

## 22. Long-Term Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Infrastructure + database schema + seed | ✅ Complete |
| 1 | Backend core API (auth, jobs, assignments) | ✅ Complete |
| 2 | Frontend foundation (design system, pages) | ✅ Complete |
| 3 | Advanced integration (WebSockets, AI, Analytics, Attachments) | ✅ Complete |
| 4 | Interactive Gantt chart + drag-and-drop + capacity warnings | ✅ Complete |
| 5 | E2E testing, unit tests, CSV/PDF exports, query optimization | ✅ Complete |
| 6 | Slack/Teams integration, production SMTP, client portal, action AI | Pending |

---

*Last updated: 2026-06-26 — Full Phase 0–3 audit complete. All documentation bootstrapped.*
