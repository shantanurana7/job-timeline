# API_GUIDE.md — API Reference

> Complete reference for all backend REST API endpoints and WebSocket events.
> Swagger UI available at `http://localhost:3001/api/docs` (dev only).

---

## 1. Base Configuration

| Property | Value |
|----------|-------|
| Base URL | `http://localhost:3001/api` |
| Authentication | `Authorization: Bearer <accessToken>` |
| Content-Type | `application/json` |
| File uploads | `multipart/form-data` |

### Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message",
  "meta": { "page": 1, "total": 42 }
}
```

**Error:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation error message",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/jobs"
}
```

---

## 2. Authentication (`/api/auth`)

### POST /api/auth/login
**Public** — Authenticate and receive token pair.

**Request:**
```json
{
  "email": "admin@jobtimeline.local",
  "password": "Admin1234!"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "uuid-v4",
    "user": {
      "id": "cuid",
      "email": "admin@jobtimeline.local",
      "firstName": "System",
      "lastName": "Admin",
      "role": "ADMIN",
      "avatarUrl": null
    }
  }
}
```

**Errors:** `401` invalid credentials, `403` account deactivated

---

### POST /api/auth/refresh
**Public** — Exchange refresh token for new token pair.

**Request:**
```json
{ "refreshToken": "uuid-v4" }
```

**Response 200:** Same structure as login (new `accessToken` + `refreshToken`)

**Errors:** `403` token revoked or expired (entire family revoked if reuse detected)

---

### POST /api/auth/logout
**JWT** — Revoke refresh token.

**Request:**
```json
{ "refreshToken": "uuid-v4" }
```

**Response 200:**
```json
{ "success": true, "data": null, "message": "Logged out successfully" }
```

---

### GET /api/auth/me
**JWT** — Get current authenticated user with stream memberships.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "cuid",
    "email": "alex@jobtimeline.local",
    "firstName": "Alex",
    "lastName": "Chen",
    "role": "DESIGNER",
    "avatarUrl": null,
    "workHoursStart": "09:00",
    "workHoursEnd": "17:00",
    "timezone": "UTC",
    "lastLoginAt": "2024-01-15T10:00:00.000Z",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "streamMemberships": [
      { "isPrimary": true, "stream": { "id": "cuid", "name": "Brand Design", "colorHex": "#6366f1" } }
    ]
  }
}
```

---

## 3. Jobs (`/api/jobs`)

### GET /api/jobs
**JWT** — List jobs (role-scoped).

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | `JobStatus` | Filter by status |
| `priority` | `JobPriority` | Filter by priority |
| `streamId` | `string` | Filter by stream |
| `search` | `string` | Search title, description, jobNumber |
| `atRiskOnly` | `boolean` | Only AT_RISK jobs |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid",
      "jobNumber": "JB-2024-0001",
      "title": "Nike Campaign Design",
      "status": "IN_PROGRESS",
      "priority": "HIGH",
      "isAtRisk": false,
      "deadline": "2024-02-01T00:00:00.000Z",
      "stream": { "id": "cuid", "name": "Brand Design", "colorHex": "#6366f1" },
      "client": { "id": "cuid", "firstName": "John", "lastName": "Doe" },
      "assignments": [
        {
          "designer": { "id": "cuid", "firstName": "Alex", "lastName": "Chen" },
          "isPrimary": true,
          "startTime": "2024-01-15T09:00:00.000Z",
          "endTime": "2024-02-01T17:00:00.000Z"
        }
      ]
    }
  ]
}
```

**Cache:** 10s TTL per user (Redis)

---

### GET /api/jobs/:id
**JWT** — Get full job detail with history.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "cuid",
    "jobNumber": "JB-2024-0001",
    "title": "Nike Campaign Design",
    "description": "Full description text...",
    "status": "IN_PROGRESS",
    "priority": "HIGH",
    "billingCode": "NIKE-2024-001",
    "deadline": "2024-02-01T00:00:00.000Z",
    "isAtRisk": false,
    "delegationCount": 0,
    "notes": "Internal notes...",
    "rejectionReason": null,
    "completedAt": null,
    "stream": { ... },
    "client": { ... },
    "assignments": [ ... ],
    "statusHistory": [
      {
        "id": "cuid",
        "fromStatus": "SUBMITTED",
        "toStatus": "UNDER_REVIEW",
        "changedById": "cuid",
        "isSystem": false,
        "reason": null,
        "changedAt": "2024-01-10T14:00:00.000Z"
      }
    ],
    "attachments": [ ... ],
    "delegations": [ ... ]
  }
}
```

---

### POST /api/jobs
**JWT** — Submit a new job.

**Request:**
```json
{
  "title": "Nike Campaign Design",
  "description": "Full project description...",
  "priority": "HIGH",
  "streamId": "cuid",
  "deadline": "2024-02-01T00:00:00.000Z",
  "billingCode": "NIKE-2024-001",
  "notes": "Internal notes"
}
```

**Response 201:** Full job object with generated `jobNumber`

**Notes:**
- `jobNumber` is auto-generated (`JB-{YEAR}-{NNNN}`)
- `status` starts as `SUBMITTED`
- `clientId` set from authenticated user

---

### PATCH /api/jobs/:id
**JWT** — Update editable job fields.

**Request (all optional):**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "priority": "CRITICAL",
  "deadline": "2024-03-01T00:00:00.000Z",
  "billingCode": "NEW-CODE",
  "streamId": "cuid",
  "notes": "Updated notes"
}
```

**Response 200:** Updated job object

---

### PATCH /api/jobs/:id/status
**JWT** (ADMIN, WORKFLOW_ADMIN) — Change job status via state machine.

**Request:**
```json
{
  "status": "ACCEPTED",
  "reason": "Looks good, approved for Brand Design stream"
}
```

**Notes:**
- Invalid transitions return `400 Bad Request`
- `reason` required when transitioning to `REJECTED`
- Triggers WebSocket `job:status_changed` event
- Appends `JobStatusHistory` entry

**Valid transitions:** See state machine in `ARCHITECTURE.md`

---

### POST /api/jobs/:id/delegate
**JWT** (ADMIN, WORKFLOW_ADMIN) — Delegate job to another stream.

**Request:**
```json
{
  "toStreamId": "cuid",
  "reason": "Better suited for Digital Marketing"
}
```

**Errors:** `400` if `delegationCount >= 3`

---

## 4. Assignments (`/api/assignments`)

### POST /api/assignments
**JWT** (ADMIN, WORKFLOW_ADMIN) — Assign a designer to a job.

**Request:**
```json
{
  "jobId": "cuid",
  "designerId": "cuid",
  "isPrimary": true,
  "startTime": "2024-01-15T09:00:00.000Z",
  "endTime": "2024-02-01T17:00:00.000Z"
}
```

**Response 201:** Assignment object with designer and job details

**Notes:**
- Max 3 active assignments per job
- Auto-advances job from `ACCEPTED` → `ASSIGNED`
- Sends `notification:new` WebSocket event to designer

---

### DELETE /api/assignments/:id
**JWT** (ADMIN, WORKFLOW_ADMIN) — Unassign a designer.

**Request:**
```json
{ "reason": "Designer reassigned to higher priority project" }
```

**Response 200:** Confirmation

**Notes:**
- Sets `isActive: false` on assignment
- Creates `JobAssignmentHistory` record
- Sends notification to designer

---

### GET /api/assignments/designer/:designerId/schedule
**JWT** — Get designer's assignment schedule.

**Query params:** `from` (ISO date), `to` (ISO date)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid",
      "startTime": "...",
      "endTime": "...",
      "isPrimary": true,
      "job": {
        "id": "cuid",
        "jobNumber": "JB-2024-0001",
        "title": "Nike Campaign",
        "status": "IN_PROGRESS",
        "priority": "HIGH",
        "deadline": "...",
        "isAtRisk": false,
        "stream": { "name": "Brand Design", "colorHex": "#6366f1" }
      }
    }
  ]
}
```

---

### GET /api/assignments/job/:jobId
**JWT** — Get all active assignments for a job.

**Response 200:** Array of active assignments with designer and assignedBy details

---

### GET /api/assignments/timeline
**JWT** (ADMIN, WORKFLOW_ADMIN) — Get all designer schedules for the timeline view.

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | ISO date string | Yes | Timeline start |
| `to` | ISO date string | Yes | Timeline end |
| `streamId` | string | No | Filter by stream |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "designer": { "id": "cuid", "firstName": "Alex", "lastName": "Chen", "avatarUrl": null },
      "slots": [ ... ]
    }
  ]
}
```

---

## 5. Notifications (`/api/notifications`)

### GET /api/notifications
**JWT** — Get user's notifications (max 50, newest first).

**Query params:** `unreadOnly=true` (optional)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid",
      "type": "JOB_ASSIGNED",
      "title": "New Job Assignment",
      "message": "You have been assigned to JB-2024-0001",
      "jobId": "cuid",
      "isRead": false,
      "readAt": null,
      "metadata": { "jobNumber": "JB-2024-0001" },
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

---

### PATCH /api/notifications/:id/read
**JWT** — Mark notification as read.

**Response 200:** Updated notification

---

### PATCH /api/notifications/read-all
**JWT** — Mark all user notifications as read.

**Response 200:**
```json
{ "success": true, "data": null, "message": "All notifications marked as read" }
```

---

## 6. Users (`/api/users`)

### GET /api/users
**JWT** (ADMIN, WORKFLOW_ADMIN) — List users with filters.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `role` | `Role` | Filter by role |
| `isActive` | `boolean` | Filter by active status |
| `streamId` | `string` | Filter by stream membership |
| `search` | `string` | Search by name or email |

---

### GET /api/users/:id
**JWT** — Get user detail with stream memberships.

---

### POST /api/users
**JWT** (ADMIN) — Create new user.

**Request:**
```json
{
  "email": "new.designer@company.com",
  "password": "SecurePass123!",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "DESIGNER",
  "workHoursStart": "08:00",
  "workHoursEnd": "16:00",
  "timezone": "America/New_York"
}
```

---

### PATCH /api/users/:id
**JWT** (ADMIN or self) — Update user fields.

**Notes:** Only ADMIN can change `role` or `isActive`

---

### DELETE /api/users/:id
**JWT** (ADMIN) — Deactivate user (sets `isActive: false`).

---

## 7. Streams (`/api/streams`)

### GET /api/streams
**JWT** — List streams.

**Query params:** `all=true` to include inactive streams

---

### GET /api/streams/:id
**JWT** — Get stream detail with members.

---

### POST /api/streams
**JWT** (ADMIN) — Create stream.

**Request:**
```json
{
  "name": "Motion Graphics",
  "description": "Video and animation team",
  "colorHex": "#10b981"
}
```

---

### PATCH /api/streams/:id
**JWT** (ADMIN) — Update stream.

---

### POST /api/streams/:id/members
**JWT** (ADMIN, WORKFLOW_ADMIN) — Add member to stream.

**Request:**
```json
{
  "userId": "cuid",
  "isPrimary": false
}
```

---

### DELETE /api/streams/:id/members/:userId
**JWT** (ADMIN, WORKFLOW_ADMIN) — Remove member from stream.

---

## 8. Analytics (`/api/analytics`)

### GET /api/analytics/dashboard
**JWT** — Dashboard KPIs (role-scoped, 30s cache).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "kpis": {
      "totalJobs": 47,
      "atRiskCount": 3,
      "completedToday": 2,
      "completionRate": 68.5,
      "inProgress": 12,
      "submitted": 5
    },
    "byStatus": {
      "SUBMITTED": 5,
      "IN_PROGRESS": 12,
      "COMPLETED": 23,
      ...
    },
    "recentJobs": [ ... ],
    "atRiskJobs": [ ... ]
  }
}
```

---

### GET /api/analytics/workload
**JWT** — Designer workload with active assignment counts.

---

### GET /api/analytics/streams
**JWT** — Stream throughput metrics.

---

## 9. Attachments

### POST /api/jobs/:jobId/attachments
**JWT** — Upload file attachment.

**Request:** `multipart/form-data`, field name: `file`

**Constraints:**
- Max size: 50MB
- Max per job: 5
- Allowed types: PDF, DOCX, XLSX, PNG, JPG, ZIP, AI, PSD

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "cuid",
    "fileName": "brief.pdf",
    "fileKey": "/uploads/abc123.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": "2048000",
    "type": "JOB_ATTACHMENT",
    "createdAt": "..."
  }
}
```

**Note:** `sizeBytes` is serialized as string (BigInt)

---

### GET /api/jobs/:jobId/attachments
**JWT** — List job attachments (excludes soft-deleted).

---

### DELETE /api/attachments/:id
**JWT** — Soft-delete attachment (`isDeleted: true`).

**Access:** Uploader, ADMIN, or WORKFLOW_ADMIN only

---

## 10. Settings (`/api/settings`)

### GET /api/settings
**JWT** (ADMIN) — List non-secret settings.

---

### PATCH /api/settings/:key
**JWT** (ADMIN) — Update setting value.

**Request:**
```json
{ "value": "48" }
```

---

## 11. AI (`/api/ai`)

### POST /api/ai/chat
**JWT** + Rate-limited (10 req/60s) — Chat with AI Workflow Agent.

**Request:**
```json
{
  "query": "Which of my jobs is most urgent right now?",
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! How can I help?" }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "reply": "Based on your active jobs, **JB-2024-0003** has the closest deadline..."
  }
}
```

**Notes:**
- Context automatically includes user's active job assignments
- `history` is optional (new conversation each time if omitted)
- Responses are Markdown-formatted

---

## 12. WebSocket Events

**Connection:** `io('http://localhost:3001', { auth: { token: accessToken } })`

### Events the client listens to:

| Event | Payload | When |
|-------|---------|------|
| `notification:unread_count` | `{ count: number }` | On connect + after markAllRead |
| `notification:new` | Full notification object | When new notification created for user |
| `job:status_changed` | `{ jobId, status, jobNumber, title, changedBy }` | When any job status changes |

### Events the client sends:
None — WebSocket is server → client only in current implementation.

---

## 13. Rate Limits

| Endpoint | Limit |
|----------|-------|
| All endpoints | 100 requests per 60 seconds per IP |
| `POST /api/ai/chat` | 10 requests per 60 seconds per IP |

Rate limit exceeded returns `429 Too Many Requests`.

---

## 14. Error Reference

| Code | Meaning | Common Causes |
|------|---------|--------------|
| 400 | Bad Request | Validation failed, invalid state transition |
| 401 | Unauthorized | Missing/expired/invalid token |
| 403 | Forbidden | Wrong role, revoked token, token reuse detected |
| 404 | Not Found | Resource doesn't exist or access denied |
| 409 | Conflict | Duplicate email, constraint violation |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected exception (check Winston logs) |

---

*Last updated: 2026-06-26*
