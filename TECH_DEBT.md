# TECH_DEBT.md — Technical Debt Register

> Tracks known issues, incomplete implementations, and future improvements.
> Every item has a severity, location, and recommended fix.
> Updated whenever debt is discovered or resolved.

---

## Severity Scale
- **Critical** — Must fix before production deployment
- **High** — Should fix before Phase 5
- **Medium** — Address in Phase 5 cleanup
- **Low** — Nice to have / future consideration

---

## Active Debt Items

---

### TD-001: ThrottlerModule imported twice in app.module.ts
**Severity:** High
**File:** `backend/src/app.module.ts`
**Description:** `ThrottlerModule.forRoot()` is called twice — once with `{ ttl: 60000, limit: 100 }` and once with `{ ttl: 60000, limit: 10 }`. The second import overrides the first, meaning the intended 100 req/60s general limit is not applied.
**Fix:**
```typescript
// Single ThrottlerModule with named throttlers
ThrottlerModule.forRoot([
  { name: 'default', ttl: 60000, limit: 100 },
  { name: 'ai', ttl: 60000, limit: 10 },
])
// Then use @Throttle({ ai: { limit: 10, ttl: 60000 } }) on AI controller
```
**Phase:** 5

---

### TD-002: AuditModule is empty — no service or controller
**Severity:** High
**File:** `backend/src/modules/audit/` (empty directory)
**Description:** The `AuditLog` model is fully defined in the Prisma schema with 20+ fields and rich indexing. The `AuditModule` directory exists but contains no code. No audit events are being recorded anywhere in the application.
**Fix:** Implement `AuditService.log(action, entityType, entityId, before, after, actor)` and inject into jobs, auth, and users services.
**Phase:** 5

---

### TD-003: TimelineModule is empty
**Severity:** Medium
**File:** `backend/src/modules/timeline/` (empty directory)
**Description:** The `TimelineModule` directory was created as a placeholder. Timeline functionality currently lives in `AssignmentsService.getAllDesignerSchedules()`. The empty module is misleading.
**Fix:** Either delete the empty directory or move timeline-specific logic (Gantt chart queries, capacity calculations) into `TimelineModule` as Phase 4 is implemented.
**Phase:** 4

---

### TD-004: Two Google AI SDKs installed
**Severity:** Medium
**Files:** `backend/package.json`
**Description:** Both `@google/genai` (v2.10, actively used in `AiService`) and `@google/generative-ai` (v0.24, unused) are in dependencies. This adds ~1.5MB of dead code.
**Fix:** Remove `@google/generative-ai` from dependencies.
```bash
cd backend && npm uninstall @google/generative-ai
```
**Phase:** 5

---

### TD-005: React Query installed but not used
**Severity:** Medium
**File:** `frontend/package.json`
**Description:** `@tanstack/react-query` v5.101.1 is installed but all data fetching is done manually with `useState + useEffect + axios`. React Query would eliminate boilerplate loading/error state management and add automatic caching, deduplication, and refetch-on-focus.
**Fix:** Migrate pages to React Query's `useQuery` and `useMutation` hooks. This is a significant refactor — do it module by module starting with `/jobs`.
**Phase:** 5

---

### TD-006: BullMQ configured but no queue consumers
**Severity:** Medium
**File:** `backend/src/app.module.ts`
**Description:** `BullModule` is wired up in `AppModule` but no queues are registered, produced, or consumed. The infrastructure investment yields no benefit yet.
**Fix:** When email notifications are needed (Phase 6), create `backend/src/modules/email/email.processor.ts` with `@Processor('email')` and add email jobs from NotificationsService.
**Phase:** 6

---

### TD-007: Socket.io CORS allows all origins
**Severity:** High (Security)
**File:** `backend/src/modules/notifications/notifications.gateway.ts`
**Description:** `@WebSocketGateway({ cors: { origin: '*' } })` allows any domain to establish a WebSocket connection.
**Fix:**
```typescript
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true }
})
```
**Phase:** 5

---

### TD-008: Refresh token stored in localStorage
**Severity:** High (Security, Production Blocker)
**File:** `frontend/src/app/login/page.tsx`, `frontend/src/components/layout/Sidebar.tsx`
**Description:** Refresh token is stored in `localStorage`. While access token is memory-only (good), localStorage is vulnerable to XSS attacks.
**Fix:** Switch to HTTP-only cookie for refresh token on production.
**Phase:** 5

---

### TD-009: frontend/src/features/ directories are all empty
**Severity:** Low
**File:** `frontend/src/features/` (6 empty subdirs: ai-assistant, analytics, auth, jobs, notifications, timeline)
**Description:** These directories were created as a placeholder for a feature-based organization refactor. They contain no files. New code continues to be added to `/app` pages and `/components`, making these confusing empty directories.
**Fix:** Either:
1. Delete all 6 empty directories (simpler)
2. Commit to the feature-folder pattern and migrate page logic into them (bigger effort)
**Phase:** 5

---

### TD-010: ~~No tests at all~~ — **RESOLVED** (2026-06-26)
**Severity:** ~~Critical~~ → ~~Medium~~ → Closed
**Resolved:**
- Unit: `jobs.service.spec.ts` (58 tests), `auth.service.spec.ts` (17 tests), `analytics.service.spec.ts` (9 tests)
- E2E: `e2e/auth.spec.ts` (6 tests), `e2e/job-lifecycle.spec.ts` (7 tests)
**Remaining:** `AssignmentsService` unit tests (Phase 6 backlog)

---

### TD-011: ~~Analytics navigation item points to non-existent page~~ — **RESOLVED** (2026-06-26)
**Resolved:** Created `frontend/src/app/(app)/analytics/page.tsx` with stream throughput table, designer workload grid, and CSV export button. Backend export endpoint at `GET /api/analytics/export`.

---

### TD-012: No cache invalidation on write operations
**Severity:** Medium
**File:** `backend/src/common/interceptors/user-cache.interceptor.ts`
**Description:** The Redis cache is TTL-only (10s jobs, 30s analytics). When a job is created, updated, or deleted, the cache is not explicitly invalidated. Users see stale data for up to 10 seconds after a change.
**Fix:** Add cache invalidation in `JobsService` write methods using `CacheManager.del(key)`. Keys follow the pattern `${userId}:${urlKey}`.
**Phase:** 5

---

### TD-013: BigInt serialization not handled globally
**Severity:** Medium
**Files:** `backend/src/modules/attachments/attachments.service.ts`
**Description:** `Attachment.sizeBytes` is a `BigInt`. Currently serialized to string only in `AttachmentsService`. If BigInt fields are added to other models, developers may forget to serialize them and get a runtime JSON error.
**Fix:** Add a global BigInt serializer in the NestJS response interceptor:
```typescript
// In main.ts before listen()
app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
// Or: JSON.stringify replacer for BigInt
```
**Phase:** 5

---

### TD-014: Delegation logic bypasses state machine for ACCEPTED → DELEGATED
**Severity:** Low
**File:** `backend/src/modules/jobs/jobs.service.ts`
**Description:** `JobsService.delegate()` manually sets `status: 'DELEGATED'` without going through `changeStatus()`. This means the state machine validation and `JobStatusHistory` creation in `delegate()` are bespoke rather than reusing the existing pattern.
**Fix:** Refactor `delegate()` to call `changeStatus(id, { status: 'DELEGATED' }, user)` internally, then add the delegation-specific record creation.
**Phase:** 5

---

### TD-015: Admin section has no `/admin/page.tsx` root
**Severity:** Low
**File:** `frontend/src/app/(app)/admin/`
**Description:** No `page.tsx` exists at `/admin`. Only `/admin/users`, `/admin/streams`, and `/admin/settings` exist. Navigating to `/admin` shows a Next.js 404.
**Fix:** Create `frontend/src/app/(app)/admin/page.tsx` that redirects to `/admin/users`.
**Phase:** 4

---

## Resolved Items

| ID | Description | Resolved In |
|----|-------------|-------------|
| — | None yet | — |

---

*Last updated: 2026-06-26*
