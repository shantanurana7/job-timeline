# CHANGELOG.md

All notable changes to the Job Timeline Platform are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Planned (Phase 4 — remaining)
- `/admin/page.tsx` redirect (TD-015)
- `/analytics/page.tsx` standalone page (TD-011)

---

## [0.4.0] — Phase 4: Interactive Gantt Chart — 2026-06-26

### Added
**Frontend:**
- Full rewrite of `frontend/src/app/(app)/timeline/page.tsx` with Phase 4 features
- HTML5 native drag-and-drop reassignment: drag a job bar from one designer row to another
- Reassignment confirmation modal with optional reason field, `From → To` designer display
- Capacity utilization bar per designer — green (<75%), yellow (75–100%), red (>100%)
- `⚠ Overbooked` badge when any day in the week exceeds 8 work hours
- `calcDailyHours()` utility calculates overlapping hours within 9:00–17:00 window per day
- `getMaxDailyUtilization()` returns peak daily utilization ratio for the week
- `getBarPos()` correctly handles multi-week assignments (clips to visible window)
- Grip handle on bars (visible on hover) as drag affordance for ADMIN/WORKFLOW_ADMIN only
- Drop target highlight (dashed accent outline) on designer row during drag-over
- Tooltip now shows stream color dot, AT RISK indicator, and drag hint for eligible users
- New Gantt CSS classes appended to `globals.css`: `.gantt-container`, `.gantt-row`, `.gantt-row--droptarget`, `.gantt-bar`, `.gantt-bar--dragging`, `.gantt-bar-handle`, `.gantt-tooltip`, `.capacity-bar-wrap`, `.capacity-bar-fill`, `.capacity-warning`, `.reassign-overlay`, `.reassign-card`
- Bar width increased (DAY_WIDTH 160→180px), row height increased (72→84px)

### Changed
- `GanttBar` component now receives typed props (no `any[]`) and supports drag lifecycle callbacks
- Bar positioning uses date math to correctly show partial assignments that span week boundaries
- Empty-state message updated: "No assignments this week"

---

## [0.3.0] — Phase 3: Advanced Integration — 2026-06-25

### Added
**Backend:**
- `AnalyticsModule` with `getDashboard()`, `getDesignerWorkload()`, `getStreamThroughput()` endpoints
- `AttachmentsModule` with Multer file upload (50MB max, 5 per job), soft-delete, per-job listing
- `NotificationsModule` with Socket.io `NotificationsGateway`, personal + admin rooms, unread count
- `AiModule` with Google Gemini 2.5 Pro integration, per-user active job context injection, ThrottlerGuard
- `SettingsModule` with key-value configuration store (12 seeded settings), secret field support
- WebSocket events: `notification:new`, `notification:unread_count`, `job:status_changed`
- Refresh token family-based reuse detection (revokes entire family on reuse attack)
- `UserCacheInterceptor` for per-user Redis caching of jobs list (10s TTL)
- Analytics 30s cache on dashboard endpoint
- `AT_RISK` hourly cron job in `JobsService.flagAtRiskJobs()`

**Frontend:**
- `/ai` page — full chat interface with Markdown rendering via `react-markdown`
- `/notifications` page — notification center with mark-read / mark-all-read
- `/admin/streams` page — streams list and management
- `/admin/settings` page — key-value settings with inline editing
- Topbar unread notification badge connected to Socket.io
- File attachment upload/download/delete in `/jobs/[id]`
- `at-risk-pulse` CSS animation for at-risk job indicators
- `useSocket` hook for singleton Socket.io connection management

### Changed
- Dashboard KPIs now fetched from real `AnalyticsController` (was mock data)
- Designer assignment notifications sent via both WebSocket and DB record

---

## [0.2.0] — Phase 2: Frontend Foundation — 2026-06-24

### Added
**Frontend:**
- Next.js 16 App Router project initialized with TypeScript
- Complete dark-mode CSS design system in `globals.css` (549 lines, 30+ CSS variables)
- Custom grid-based layout (Sidebar 240px + main content area)
- `AuthProvider` for token refresh bootstrap on page load
- Zustand `auth.store` and `toast.store`
- All API service methods in `frontend/src/services/index.ts`
- Axios client with 401-refresh interceptor
- `frontend/src/types/index.ts` — all TypeScript interfaces matching backend DTOs
- `frontend/src/lib/utils.ts` — `cn`, `formatDate`, `formatRelativeTime`, `deadlineCountdown`, etc.
- `/login` page with demo account quick-fill buttons
- `/dashboard` page with KPI cards, recent jobs, at-risk jobs
- `/jobs` page with filters (status, priority, stream, search, at-risk-only)
- `/jobs/new` page with form validation
- `/jobs/[id]` page with full detail, status history timeline, assignments, attachments
- `/timeline` page — designer Gantt view with week navigation and stream filter
- `/admin/users` page — team management with role badges
- `Avatar`, `StatusBadge`, `PriorityBadge`, `ToastContainer` components
- `Sidebar` with role-based navigation items
- Responsive layout with sticky topbar

### Architecture Decision
- **No Tailwind utility classes** — all styling via custom CSS variables. A previous attempt to use Tailwind broke the grid layout and was fully reverted. Future agents must respect this constraint.

---

## [0.1.0] — Phase 1: Backend Core API — 2026-06-23

### Added
- NestJS 11 backend project initialized
- `AuthModule` — JWT login, refresh token rotation, Argon2 password hashing
- `JwtStrategy` — Passport.js JWT validation, user existence check per request
- `RolesGuard` + `@Roles()` decorator — RBAC enforcement
- `@CurrentUser()` parameter decorator
- `UsersModule` — CRUD with role-based access, stream membership
- `StreamsModule` — Team/department CRUD, member management
- `JobsModule` — 12-state state machine, atomic job number generation, delegation (max 3 hops), AT_RISK cron
- `AssignmentsModule` — Designer scheduling with time windows, max-3 constraint, timeline view
- `AllExceptionsFilter` — Standardized error response format
- `ApiResponse<T>` DTO with `ok()` and `fail()` static helpers
- Global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)
- Swagger UI at `/api/docs` (dev only)
- Winston structured logging (dev: colored console, prod: JSON files)
- Helmet security headers
- CORS locked to `FRONTEND_URL`

---

## [0.0.0] — Phase 0: Infrastructure & Data Model — 2026-06-22

### Added
- `docker-compose.yml` with PostgreSQL 16, Redis 7, pgAdmin 4, RedisInsight, MailHog
- Comprehensive Prisma schema with 14 models, 5 enums
- All foreign key relationships and performance indexes
- `prisma/seed.ts` — 10 users, 2 streams, 10 jobs, assignments, notifications, settings
- Seeded demo credentials for all 4 roles
- `.env.example` with all required environment variables documented
- Monorepo structure: `backend/` + `frontend/` directories

---

*Last updated: 2026-06-26*
