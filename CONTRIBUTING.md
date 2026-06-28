# CONTRIBUTING.md — Contributor Guide

> Guide for developers (human or AI) taking on new work in this repository.

---

## 1. Before You Start

Read these files in this order:
1. `CLAUDE.md` — Project overview, tech stack, philosophy, commands
2. `PROJECT_RULES.md` — Coding conventions, naming, error handling
3. `ARCHITECTURE.md` — System design and data flow
4. `TECH_DEBT.md` — Known issues to be aware of

Then inspect the specific area you're working in:
- API changes → `API_GUIDE.md`
- Database changes → `DATABASE_GUIDE.md`
- Frontend UI → `COMPONENT_GUIDE.md`
- AI changes → `AI_GUIDE.md`

---

## 2. Development Setup

### Prerequisites
- Node.js 18+
- Docker Desktop (running)
- Git

### First-time setup

```bash
# 1. Clone repository
git clone <repo-url>
cd timeline

# 2. Start infrastructure
docker-compose up -d

# Wait for health checks — takes ~10 seconds
docker-compose ps  # All services should show "healthy" or "Up"

# 3. Backend setup
cd backend
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY
npm install
npm run migrate:dev  # Apply migrations
npm run seed         # Seed demo data
npm run start:dev    # Start backend (port 3001)

# 4. Frontend setup (new terminal)
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" > .env.local
npm install
npm run dev          # Start frontend (port 3000)
```

### Verify setup
1. Open http://localhost:3000 — should redirect to login
2. Login with `admin@jobtimeline.local` / `Admin1234!`
3. Dashboard should show KPI cards
4. Open http://localhost:3001/api/docs — Swagger UI should load

---

## 3. Development Workflow

### For every code change, follow these steps:

**1. Understand the request**
- What exactly needs to change?
- Does this fit within the existing architecture?
- Are there existing patterns to follow?

**2. Inspect the codebase**
- Find the relevant files using the folder structure in `CLAUDE.md`
- Read the current implementation before writing anything
- Search for existing utilities before creating new ones

**3. Plan**
- Which files will change?
- Are there DB migrations needed?
- Are there risks to existing functionality?
- Will you need to update documentation?

**4. Implement**
- Follow all rules in `PROJECT_RULES.md`
- Use CSS variables, not hardcoded values
- Never add Tailwind classes
- Handle loading/error/empty states

**5. Verify**
- Does the feature work as intended?
- Do adjacent features still work?
- Are there TypeScript errors?

**6. Document**
- Update `API_GUIDE.md` if endpoints changed
- Update `DATABASE_GUIDE.md` if schema changed
- Update `COMPONENT_GUIDE.md` if components changed
- Append to `DEVELOPMENT_LOG.md`

---

## 4. Branch Strategy

```
main            ← Production-ready code
feature/phase-4-gantt-chart    ← Feature branches
fix/socket-cors-security       ← Fix branches
debt/remove-duplicate-throttler ← Tech debt branches
```

Branch naming:
- `feature/` — new features
- `fix/` — bug fixes
- `debt/` — tech debt resolution
- `chore/` — dependency updates, config changes

---

## 5. Commit Message Format

```
type(scope): short description

Optional longer description explaining why.

Optional notes on trade-offs or future work.
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change without new feature or fix
- `debt` — technical debt resolution
- `docs` — documentation only
- `chore` — dependency updates, config, tooling
- `test` — adding tests

**Scopes:** `auth`, `jobs`, `assignments`, `notifications`, `ai`, `analytics`, `attachments`, `settings`, `frontend`, `infra`, `db`

**Examples:**
```
feat(jobs): add CSV export endpoint for job list
fix(auth): revoke entire token family on reuse detection
debt(app): remove duplicate ThrottlerModule import
docs(api): document delegation endpoint in API_GUIDE.md
```

---

## 6. Adding a New Backend Feature

Checklist:

- [ ] Create module folder: `backend/src/modules/{feature}/`
- [ ] Create: `feature.module.ts`, `feature.service.ts`, `feature.controller.ts`, `dto/`
- [ ] Add `@ApiProperty()` to all DTO fields
- [ ] Use `@UseGuards(JwtAuthGuard)` + `@Roles()` on controller
- [ ] Use `@CurrentUser()` — never `req.user`
- [ ] Return `ApiResponse.ok(data)` from controller methods
- [ ] Inject `Logger` and use it in service methods
- [ ] Register module in `app.module.ts`
- [ ] Add endpoints to `API_GUIDE.md`
- [ ] Append to `DEVELOPMENT_LOG.md`

---

## 7. Adding a New Frontend Page

Checklist:

- [ ] Create `frontend/src/app/(app)/{feature}/page.tsx`
- [ ] Add `'use client'` at top
- [ ] Add page to Sidebar nav items (with role restriction if needed)
- [ ] Use `useState` for `isLoading`, `error`, and data
- [ ] Call API via `frontend/src/services/index.ts` (never raw fetch)
- [ ] Show `.spinner` during loading
- [ ] Show `.empty-state` when no data
- [ ] Show `toast.error()` on API errors
- [ ] Use CSS classes from `globals.css` — no hardcoded colors
- [ ] Append to `DEVELOPMENT_LOG.md`

---

## 8. Adding a Database Model

Checklist:

- [ ] Add model to `backend/prisma/schema.prisma`
- [ ] Add appropriate indexes
- [ ] Run `npm run migrate:dev` — review generated SQL before applying
- [ ] Run `npx prisma generate` to update client types
- [ ] Add to `DATABASE_GUIDE.md`
- [ ] Update seed file if demo data needed

---

## 9. Adding a CSS Class

Only one rule: **add it to `frontend/src/app/globals.css`**.

Naming convention: `kebab-case`, component-prefixed.

```css
/* ✅ Correct */
.timeline-bar {
  background: var(--accent);
  border-radius: var(--radius-sm);
}

.timeline-bar--at-risk {
  background: var(--danger);
  animation: riskPulse 2s infinite;
}

/* ❌ Never do this */
<div style={{ background: '#6366f1', borderRadius: '6px' }}>
```

---

## 10. Common Pitfalls to Avoid

| Pitfall | Consequence |
|---------|-------------|
| Adding Tailwind classes | Breaks grid layout |
| Hardcoding CSS hex values | Colors inconsistent across theme |
| Setting `job.status` directly in Prisma | Bypasses state machine, no history entry |
| Returning BigInt from attachments | JSON serialization error |
| Not filtering `isDeleted: false` on attachments | Deleted files appear in UI |
| Not scoping DB query by role | Data leak between roles |
| Storing anything sensitive in `console.log` | Tokens in logs |
| Creating a Notification without a WebSocket push | User sees notification only on refresh |

---

## 11. Asking for Help

- **Architecture questions:** Re-read `ARCHITECTURE.md` and `CLAUDE.md` first
- **API behavior:** Check `API_GUIDE.md` and Swagger at http://localhost:3001/api/docs
- **Database questions:** Check `DATABASE_GUIDE.md` and run `npm run studio`
- **AI questions:** Check `AI_GUIDE.md`

---

*Last updated: 2026-06-26*
