# PROJECT_RULES.md — Engineering Rulebook

> These rules are non-negotiable. They encode decisions made during architecture design.
> Before asking "can I do X differently?", check if there is an existing rule that answers it.

---

## 1. Definition of Done

A task is **Done** when:
- [ ] Code compiles without TypeScript errors
- [ ] All existing functionality still works (no regressions)
- [ ] Loading state shown during async operations
- [ ] Error state handled and surfaced to the user
- [ ] Empty state shown when no data exists
- [ ] New or changed API endpoints documented in `API_GUIDE.md`
- [ ] New or changed database models documented in `DATABASE_GUIDE.md`
- [ ] `DEVELOPMENT_LOG.md` entry appended
- [ ] Relevant documentation files updated

A task is **not Done** if:
- There are TypeScript `any` types introduced without justification
- There is unhandled promise rejection
- There are hardcoded secrets, API keys, or credentials
- There are `console.log` statements in production paths

---

## 2. Coding Conventions

### General
- TypeScript strict mode — always
- No `any` — use `unknown` and type-narrow, or use the correct Prisma/DTO types
- Prefer `const` over `let`. Never use `var`.
- Async/await — always. No `.then()` chains.
- Early returns over deep nesting
- Functions do one thing
- Maximum function length: ~50 lines (guideline, not hard limit)

### Naming
| Thing | Convention | Example |
|-------|-----------|---------|
| Variables | camelCase | `currentUser`, `atRiskJobs` |
| Functions | camelCase verb-noun | `generateJobNumber`, `findActiveAssignments` |
| Classes | PascalCase | `JobsService`, `NotificationsGateway` |
| Interfaces | PascalCase, no `I` prefix | `User`, `Job`, `ApiResponse` |
| Enums | PascalCase name, SCREAMING_SNAKE values | `JobStatus.IN_PROGRESS` |
| Constants | SCREAMING_SNAKE_CASE | `ROLES_KEY`, `MAX_DELEGATION_HOPS` |
| Files (backend) | kebab-case | `jobs.service.ts`, `create-job.dto.ts` |
| Files (frontend) | PascalCase for components, camelCase for utils | `Avatar.tsx`, `auth.store.ts` |
| CSS classes | kebab-case | `.btn-primary`, `.status-in-progress` |
| Env variables | SCREAMING_SNAKE_CASE | `JWT_ACCESS_SECRET`, `GEMINI_API_KEY` |

---

## 3. Folder Conventions

### Backend Module Structure
Every domain feature lives in `backend/src/modules/{feature}/` and contains:
```
feature/
├── feature.module.ts       ← Module definition
├── feature.controller.ts   ← HTTP endpoints
├── feature.service.ts      ← Business logic
└── dto/
    ├── create-feature.dto.ts
    ├── update-feature.dto.ts
    └── feature-response.dto.ts
```
Optional (when needed):
```
├── guards/
├── decorators/
├── strategies/             ← Passport strategies
└── types/
```

### Frontend Page Structure
Pages live in `frontend/src/app/(app)/{feature}/page.tsx`.
Keep all page logic in the page file unless it reaches 300+ lines, then extract to a separate component file in `frontend/src/components/`.

### No New Top-Level Folders
Do not create top-level folders (e.g., `lib/`, `helpers/`, `utils/`) in either backend or frontend without team discussion. Use existing paths.

---

## 4. Component Conventions

- Components are in `frontend/src/components/`
- Components receive data via props — they do not make API calls
- Components emit events via callback props — they do not navigate programmatically
- Component files export a single named export matching the filename
- Props interfaces are defined at the top of the file
- Default exports are used only in Next.js page files

**Component size guideline:**
- Single responsibility — a component does one clear thing
- If a component imports from more than 5 other components, consider splitting it
- If JSX exceeds ~200 lines, extract sub-components

---

## 5. API Conventions

### URL Pattern
```
/api/{resource}                    ← Collection
/api/{resource}/:id                ← Single resource
/api/{resource}/:id/{sub-resource} ← Nested resource
/api/{resource}/:id/{action}       ← Action on resource (PATCH preferred)
```

Examples:
```
GET    /api/jobs                     ← List jobs
GET    /api/jobs/:id                 ← Get job
POST   /api/jobs                     ← Create job
PATCH  /api/jobs/:id                 ← Update job
PATCH  /api/jobs/:id/status          ← Change job status (action)
POST   /api/jobs/:id/delegate        ← Delegate job (action)
POST   /api/jobs/:jobId/attachments  ← Upload attachment (nested)
GET    /api/jobs/:jobId/attachments  ← List attachments (nested)
```

### HTTP Methods
- `GET` — read-only, idempotent
- `POST` — create new resource
- `PATCH` — partial update (preferred over PUT)
- `DELETE` — delete or deactivate
- No `PUT` unless full resource replacement is semantically correct

### Response Format
All responses use `ApiResponse<T>`:
```typescript
// Success
{ success: true, data: T, message?: string, meta?: Record<string, any> }

// Error (from AllExceptionsFilter)
{ success: false, statusCode: number, message: string, timestamp: string, path: string }
```

Controllers return `ApiResponse.ok(data)` or `ApiResponse.ok(data, 'Custom message')`.

### HTTP Status Codes
| Situation | Code |
|-----------|------|
| Success (read/update) | 200 |
| Created | 201 |
| No content | 204 |
| Bad request / validation | 400 |
| Unauthorized (no/invalid token) | 401 |
| Forbidden (wrong role) | 403 |
| Not found | 404 |
| Conflict | 409 |
| Too many requests | 429 |
| Server error | 500 |

---

## 6. DTO Conventions

Every request body and query parameter has a DTO class.

```typescript
// ✅ Correct
export class CreateJobDto {
  @ApiProperty({ description: 'Job title', example: 'Nike Campaign Design' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ enum: JobPriority, default: JobPriority.MEDIUM })
  @IsEnum(JobPriority)
  @IsOptional()
  priority?: JobPriority = JobPriority.MEDIUM;
}

// ❌ Never do this
async create(@Body() body: any) { ... }
```

**Rules:**
- All fields have `@ApiProperty()` with description and example
- Optional fields use `@IsOptional()` and `?` TypeScript type
- Enums use `@IsEnum(EnumType)`
- Dates use `@IsDateString()` and `@Transform()` if needed
- DTOs live in `dto/` subdirectory of the module
- Never reuse request DTOs as response types

---

## 7. Prisma Conventions

- Never use `prisma.$queryRaw` unless there is no Prisma equivalent
- Always include `where: { tenantId: 'default', ... }` on multi-tenant queries (currently all single-tenant, but prepare for it)
- Prefer `select` over `include` for performance when partial data is sufficient
- Transactions: use `this.prisma.$transaction([...])` for atomic multi-step operations
- Never chain `prisma.resource.findMany()` inside a loop — use `include` or batch queries
- Prisma client accessed only through `PrismaService` (injected) — never instantiate `PrismaClient` directly
- Migrations: run `npm run migrate:dev` after any schema change — never edit migration files manually

---

## 8. CSS Conventions

**Rule 1: No Tailwind utility classes in any file.** Ever. The design system is 100% custom CSS.

**Rule 2: Use CSS variables for all values that appear in the design system.**
```css
/* ✅ Correct */
.my-element {
  color: var(--text-primary);
  background: var(--bg-elevated);
  border-radius: var(--radius);
}

/* ❌ Never do this */
.my-element {
  color: #f0f2f8;
  background: #1a1d27;
  border-radius: 10px;
}
```

**Rule 3: Add new CSS only in `globals.css`.** No CSS Modules, no styled-components, no inline style blocks.

**Rule 4: Use inline styles only for dynamic values** (e.g., a color from a database field like `stream.colorHex`).

**Rule 5: CSS class naming** follows kebab-case with component context:
```
.status-badge          ← General
.status-in-progress    ← Variant
.kpi-card              ← Component
.kpi-card-value        ← Child element
```

---

## 9. Error Handling

### Backend
- Controllers never catch exceptions — let `AllExceptionsFilter` handle them
- Services throw `NotFoundException`, `BadRequestException`, `ForbiddenException` (NestJS built-ins)
- Unknown/unexpected errors: log with `this.logger.error(message, stack)` then rethrow
- Never return null for "not found" — throw `NotFoundException`
- Validation errors: rely on `ValidationPipe` (global) — do not duplicate validation in services

### Frontend
- Every API call is wrapped in try/catch
- Catch blocks show `toast.error(message)` — never silently swallow errors
- `isLoading` state set before API call, cleared in finally block
- HTTP 401: handled automatically by Axios response interceptor (refresh then retry)
- HTTP 403: show "Permission denied" toast, do not redirect
- HTTP 404: navigate to `/jobs` or show inline "not found" message

---

## 10. Validation Rules

### Backend
- Input validation: `class-validator` on DTOs (applied by global `ValidationPipe`)
- `whitelist: true` — strips unknown properties automatically
- `forbidNonWhitelisted: true` — rejects requests with unknown fields
- `transform: true` — auto-converts strings to typed values (numbers, booleans, enums)

### Frontend
- Form validation: Zod schema + React Hook Form
- All user-facing forms have a Zod schema defined at the top of the file
- Validation runs on submit (not on every keystroke unless UX requires it)
- Validation errors displayed inline below the input using `.form-error` class

---

## 11. Authentication Rules

- Every route uses `@UseGuards(JwtAuthGuard)` unless it's explicitly public
- Public routes declared: `POST /auth/login`, `POST /auth/refresh`
- `@CurrentUser()` decorator extracts user from JWT-validated request
- Never trust a user ID or role from the request body — always from `@CurrentUser()`
- Access token lifetime: 15 minutes
- Refresh token lifetime: 7 days
- Refresh token reuse triggers entire token family revocation

---

## 12. Authorization Rules

- Role enforcement uses `@Roles()` decorator + `RolesGuard`
- Job data is role-scoped in queries (not just in controllers)
- CLIENT users see only jobs they submitted
- DESIGNER users see only jobs assigned to them
- WORKFLOW_ADMIN users see only jobs in their stream
- ADMIN users see everything

**Do not** rely on frontend role checks for security. The backend enforces all access control. Frontend role checks are UI-only.

---

## 13. Logging Rules

- Use `this.logger = new Logger(ServiceName.name)` in every service
- Log levels:
  - `debug` — verbose internals (dev only)
  - `log` — normal operations (login, job created, assignment made)
  - `warn` — unexpected but recoverable situations
  - `error` — exceptions and failures (include stack trace)
- Never log secrets, tokens, or passwords
- Winston writes to:
  - Console (dev: colorized, prod: JSON)
  - `logs/error.log` (errors only)
  - `logs/app.log` (everything)

---

## 14. Performance Rules

- Do not add `N+1` Prisma queries — use `include` or `select` to fetch related data in one query
- Redis cache is used for: job lists (10s TTL), analytics dashboard (30s TTL)
- Do not cache user-specific data with a shared key — use `UserCacheInterceptor` which namespaces by userId
- Do not add cache to write operations — cache invalidation is currently TTL-only
- Large lists: always add pagination parameters (`page`, `limit`) to collection endpoints
- Frontend: avoid re-fetching on every render — fetch once per page mount

---

## 15. Refactoring Rules

- Refactor only when: duplicate logic exists in 3+ places, or a module exceeds 500 lines with clear extraction opportunities
- Refactors are separate commits from feature additions
- When refactoring, write a test first if the logic is critical
- Never mix refactor + feature in the same PR
- Extract to existing patterns before inventing new ones

---

## 16. Documentation Rules

- Every new API endpoint must appear in `API_GUIDE.md`
- Every new Prisma model must appear in `DATABASE_GUIDE.md`
- Every new component must appear in `COMPONENT_GUIDE.md`
- Every completed feature appends to `DEVELOPMENT_LOG.md`
- Security changes update `SECURITY.md`
- Tech debt discovered during implementation goes in `TECH_DEBT.md`
- `CLAUDE.md` updated when architecture changes

**Documentation must be updated in the same commit as the code change.**

---

*Last updated: 2026-06-26*
