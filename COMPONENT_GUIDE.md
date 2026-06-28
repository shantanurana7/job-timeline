# COMPONENT_GUIDE.md — Frontend Component Library

> Reference for all reusable frontend components, CSS classes, and design patterns.

---

## 1. Design System Foundation

All styling lives in `frontend/src/app/globals.css`. No CSS Modules. No Tailwind utility classes.

### Color Tokens (CSS Variables)

```css
/* Backgrounds */
--bg-base: #0d0f14        /* Page background */
--bg-surface: #13161d     /* Sidebar, topbar */
--bg-elevated: #1a1d27    /* Forms, modals, inputs */
--bg-hover: #1e2232       /* Hover states */
--bg-card: #161922        /* Cards */

/* Text */
--text-primary: #f0f2f8   /* Headings, labels */
--text-secondary: #8b91a7 /* Body text */
--text-muted: #5a6180     /* Placeholder, metadata */

/* Borders */
--border: rgba(255,255,255,0.07)
--border-strong: rgba(255,255,255,0.12)

/* Accent */
--accent: #6366f1
--accent-hover: #5254cc
--accent-soft: rgba(99,102,241,0.12)
--accent-glow: rgba(99,102,241,0.25)

/* Semantic */
--success: #22c55e    --success-soft: rgba(34,197,94,0.12)
--warning: #f59e0b    --warning-soft: rgba(245,158,11,0.12)
--danger: #ef4444     --danger-soft: rgba(239,68,68,0.12)
--info: #3b82f6       --info-soft: rgba(59,130,246,0.12)

/* Spacing */
--radius-sm: 6px   --radius: 10px   --radius-lg: 14px   --radius-xl: 20px

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.4)
--shadow: 0 4px 16px rgba(0,0,0,0.5)
--shadow-lg: 0 12px 40px rgba(0,0,0,0.6)
--shadow-glow: 0 0 30px rgba(99,102,241,0.15)

/* Transitions */
--transition: 150ms ease
--transition-slow: 300ms ease
```

### Status Colors (Job Status → CSS class)

| Status | CSS Class | Color |
|--------|-----------|-------|
| SUBMITTED | `.status-submitted` | #6b7280 |
| UNDER_REVIEW | `.status-under_review` | #8b5cf6 |
| ACCEPTED | `.status-accepted` | #3b82f6 |
| DELEGATED | `.status-delegated` | #a855f7 |
| ASSIGNED | `.status-assigned` | #06b6d4 |
| IN_PROGRESS | `.status-in_progress` | #6366f1 |
| PAUSED | `.status-paused` | #f59e0b |
| AT_RISK | `.status-at_risk` | #ef4444 |
| ON_HOLD | `.status-on_hold` | #d97706 |
| COMPLETED | `.status-completed` | #22c55e |
| REJECTED | `.status-rejected` | #dc2626 |
| CANCELLED | `.status-cancelled` | #6b7280 |

### Priority Colors

| Priority | CSS Class | Color |
|----------|-----------|-------|
| LOW | `.priority-low` | #6b7280 |
| MEDIUM | `.priority-medium` | #3b82f6 |
| HIGH | `.priority-high` | #f59e0b |
| CRITICAL | `.priority-critical` | #ef4444 |

---

## 2. Layout Classes

```css
/* App shell */
.app-shell          /* flex, min-height: 100vh */
.sidebar            /* fixed left, 240px wide, z-index: 100 */
.main-content       /* margin-left: 240px, flex: 1 */
.page               /* flex: 1, padding: 2rem, max-width: 1400px */
.topbar             /* sticky, height: 60px, z-index: 50 */
```

---

## 3. Reusable Components

### `Avatar`
**File:** `frontend/src/components/ui/Avatar.tsx`

Renders a user avatar image or initials with a deterministic color.

```tsx
interface AvatarProps {
  firstName?: string
  lastName?: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  color?: string
}
```

**CSS classes:** `.avatar`, `.avatar-sm` (24px), `.avatar-md` (36px), `.avatar-lg` (48px)

**Behavior:**
- If `avatarUrl` is provided → renders `<img>`
- Otherwise → renders initials with one of 8 deterministic color variants
- Color is based on hash of first+last name (consistent per user)

**Usage:**
```tsx
<Avatar firstName="Alex" lastName="Chen" size="md" />
<Avatar firstName="Alex" lastName="Chen" avatarUrl="/uploads/avatar.jpg" size="sm" />
```

---

### `StatusBadge`
**File:** `frontend/src/components/ui/Badges.tsx`

Displays a job status as a colored pill badge.

```tsx
interface StatusBadgeProps {
  status: JobStatus
}
```

**Usage:**
```tsx
<StatusBadge status="IN_PROGRESS" />
// Renders: <span class="badge status-in_progress">In Progress</span>
```

**Label mapping:** Uses `getStatusLabel()` from `lib/utils.ts`

---

### `PriorityBadge`
**File:** `frontend/src/components/ui/Badges.tsx`

Displays a job priority as a colored pill badge.

```tsx
interface PriorityBadgeProps {
  priority: JobPriority
}
```

**Usage:**
```tsx
<PriorityBadge priority="HIGH" />
// Renders: <span class="badge priority-high">High</span>
```

---

### `ToastContainer`
**File:** `frontend/src/components/ui/ToastContainer.tsx`

Global toast notification system. Renders in root layout.

**Do not render this yourself — it's in `app/layout.tsx` already.**

**Trigger via Zustand store:**
```tsx
import { useToastStore } from '@/stores/toast.store'

// Exported helper functions (preferred)
import { toast } from '@/stores/toast.store'

toast.success('Job submitted successfully')
toast.error('Failed to upload attachment')
toast.warning('Job deadline is in 2 hours')
toast.info('New assignment received')
```

**Behavior:**
- Positioned bottom-right
- Auto-dismisses after 4 seconds
- Max stack of multiple toasts
- Icons from lucide-react (CheckCircle, XCircle, AlertTriangle, Info)

---

### `Sidebar`
**File:** `frontend/src/components/layout/Sidebar.tsx`

The primary navigation sidebar. Role-aware.

**Not a reusable component** — app-level layout only. Rendered in `(app)/layout.tsx`.

**Navigation items (role-filtered):**
```
Dashboard       → /dashboard        (all roles)
Jobs            → /jobs             (all roles)
Timeline        → /timeline         (ADMIN, WORKFLOW_ADMIN)
Team            → /admin/users      (ADMIN, WORKFLOW_ADMIN)
Analytics       → /analytics        (ADMIN, WORKFLOW_ADMIN)  ⚠️ page not yet built
AI Agent        → /ai               (all roles)
Streams         → /admin/streams    (ADMIN, WORKFLOW_ADMIN)
Settings        → /admin/settings   (ADMIN only)
```

⚠️ **Known gap:** `/analytics` nav item links to a page that does not exist. Analytics data is on the Dashboard page. This nav item should either be removed or the page created.

**User footer:** Avatar + name + email + Logout button

---

### `AuthProvider`
**File:** `frontend/src/components/providers/AuthProvider.tsx`

Bootstrap component that initializes authentication on page load.

**Not reusable** — app-level only. Rendered in `(app)/layout.tsx`.

**Behavior:**
1. On mount: reads `refreshToken` from `localStorage`
2. Calls `authApi.refresh(refreshToken)` to get a new access token
3. Calls `authApi.me()` to load user profile
4. Updates `auth.store` via `setUser(user, accessToken)`
5. Redirects to `/login` if no refresh token or refresh fails

---

## 4. Hooks

### `useSocket`
**File:** `frontend/src/hooks/useSocket.ts`

Returns the singleton Socket.io connection. Creates it on first call.

```tsx
import { useSocket } from '@/hooks/useSocket'

function MyComponent() {
  const socket = useSocket()

  useEffect(() => {
    if (!socket) return

    socket.on('notification:new', (data) => {
      toast.info(data.title)
    })

    return () => {
      socket.off('notification:new')
    }
  }, [socket])
}
```

**Auth:** Sends access token via `{ auth: { token } }` on connect
**Transport:** `['websocket']` (no polling fallback)
**Connection URL:** `NEXT_PUBLIC_WS_URL` env var (defaults to `http://localhost:3001`)

---

## 5. Zustand Stores

### `auth.store.ts`

```tsx
import { useAuthStore } from '@/stores/auth.store'

// In components
const user = useAuthStore(state => state.user)
const isAuthenticated = useAuthStore(state => state.isAuthenticated)

// Actions
const { setUser, logout } = useAuthStore()
setUser(user, accessToken)  // Sets user + updates api.ts token
logout()                     // Clears user + removes refreshToken from localStorage
```

**State shape:**
```typescript
{
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  setUser: (user: User | null, token: string | null) => void
  logout: () => void
}
```

---

### `toast.store.ts`

```tsx
import { useToastStore, toast } from '@/stores/toast.store'

// Direct store (for ToastContainer)
const toasts = useToastStore(state => state.toasts)

// Helper functions (for all other usage)
toast.success('Operation succeeded')
toast.error('Something went wrong', 'Optional title')
toast.warning('Warning message')
toast.info('Informational message')
```

---

## 6. Utility Functions (`lib/utils.ts`)

```typescript
// Compose CSS class names (falsy values ignored)
cn('btn', isActive && 'btn-primary', isDisabled && 'btn-disabled')
// → "btn btn-primary"

// Format date to "15 Jan 2024"
formatDate('2024-01-15T10:00:00.000Z')
// → "15 Jan 2024"

// Format date with time "15 Jan 2024 10:00"
formatDate('2024-01-15T10:00:00.000Z', { time: true })
// → "15 Jan 2024 10:00"

// Relative time
formatRelativeTime('2024-01-15T09:55:00.000Z')
// → "5m ago"

// User initials
getInitials('Alex', 'Chen')
// → "AC"

// Status readable label
getStatusLabel('IN_PROGRESS')
// → "In Progress"

getStatusLabel('UNDER_REVIEW')
// → "Under Review"

// Priority readable label
getPriorityLabel('CRITICAL')
// → "Critical"

// Deadline countdown
deadlineCountdown('2024-01-16T10:00:00.000Z')
// → { label: "22h remaining", urgent: true }

deadlineCountdown('2024-01-10T10:00:00.000Z')
// → { label: "Overdue", urgent: true }
```

---

## 7. CSS Component Classes

### Buttons
```html
<button class="btn btn-primary">Save</button>
<button class="btn btn-secondary">Cancel</button>
<button class="btn btn-danger">Delete</button>
<button class="btn btn-ghost">Back</button>
<button class="btn btn-primary btn-sm">Small</button>
<button class="btn btn-primary btn-lg">Large</button>
<button class="btn btn-icon"><!-- icon only --></button>
```

### Forms
```html
<div class="form-group">
  <label class="form-label" for="title">Title</label>
  <input class="form-control" id="title" type="text" />
  <span class="form-error">This field is required</span>
</div>
```

### Cards
```html
<div class="card">
  <div class="card-body">
    Content here
  </div>
</div>

<!-- Elevated (darker) variant -->
<div class="card card-elevated">...</div>
```

### Tables
```html
<div class="table-wrap">
  <table>
    <thead><tr><th>Column</th></tr></thead>
    <tbody><tr><td>Value</td></tr></tbody>
  </table>
</div>
```

### KPI Grid
```html
<div class="kpi-grid">
  <div class="kpi-card">
    <div class="kpi-value">42</div>
    <div class="kpi-label">Total Jobs</div>
    <div class="kpi-delta">+5 today</div>
  </div>
</div>
```

### Badges
```html
<!-- Status badge -->
<span class="badge status-in_progress">In Progress</span>

<!-- Priority badge -->
<span class="badge priority-high">High</span>

<!-- With dot indicator -->
<span class="badge-dot badge-dot--danger"></span>
```

### Loading & Empty States
```html
<!-- Spinner -->
<div class="spinner"></div>
<div class="spinner spinner-lg"></div>

<!-- Skeleton shimmer -->
<div class="skeleton" style="height: 20px; width: 200px;"></div>

<!-- Empty state -->
<div class="empty-state">
  <div class="empty-state-icon">
    <!-- Icon here -->
  </div>
  <h3>No jobs found</h3>
  <p>Create your first job to get started</p>
</div>
```

### Animations
```html
<!-- AT_RISK pulsing indicator -->
<span class="at-risk-pulse"></span>

<!-- Fade-in entrance -->
<div class="fade-in">Content appears</div>

<!-- Slide-in entrance -->
<div class="slide-in">Content slides</div>
```

---

## 8. Adding New Components

Checklist when adding a new component:

1. Place in `frontend/src/components/{category}/ComponentName.tsx`
2. Use CSS variables — no hardcoded hex values
3. Use existing CSS classes from `globals.css` where possible
4. New CSS classes go in `globals.css` — nowhere else
5. Props interface defined at top of file
6. Handles loading/empty/error states if applicable
7. Uses `cn()` from `lib/utils.ts` for conditional classes
8. Document in this file under section 3

---

## 9. API Service Usage Pattern

All components that fetch data follow this pattern:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { jobsApi } from '@/services'
import { toast } from '@/stores/toast.store'
import type { Job } from '@/types'

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setIsLoading(true)
        const response = await jobsApi.list()
        setJobs(response.data)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load jobs'
        setError(message)
        toast.error(message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchJobs()
  }, [])

  if (isLoading) return <div class="spinner spinner-lg"></div>
  if (error) return <div class="empty-state">...</div>
  if (!jobs.length) return <div class="empty-state">No jobs found</div>

  return (/* render jobs */)
}
```

---

*Last updated: 2026-06-26*
