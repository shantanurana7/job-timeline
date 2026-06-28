# DATABASE_GUIDE.md — Prisma Schema & Data Model

> Complete reference for the database schema, relationships, conventions, and query patterns.

---

## 1. Database Setup

**Database:** PostgreSQL 16 (Docker container `timeline_postgres`)
**ORM:** Prisma v7.8 with native `@prisma/adapter-pg` (connection pooling)
**Schema file:** `backend/prisma/schema.prisma`

**Connection string format:**
```
postgresql://admin:localdev123@localhost:5432/job_timeline_db
```

**Common commands:**
```bash
cd backend

# Apply migrations in development
npm run migrate:dev

# Reset and reseed (destroys all data)
npm run migrate:reset && npm run seed

# Open Prisma Studio (visual browser)
npm run studio

# Generate Prisma client after schema change
npx prisma generate
```

---

## 2. Enums

### Role
Controls access level for every user.
```prisma
enum Role {
  ADMIN            // Full system access
  WORKFLOW_ADMIN   // Stream-scoped management
  DESIGNER         // Assignment execution
  CLIENT           // Job submission
}
```

### JobStatus
12 states in the job lifecycle state machine.
```prisma
enum JobStatus {
  SUBMITTED        // Initial state on creation
  UNDER_REVIEW     // WA/Admin reviewing
  ACCEPTED         // Approved, ready to assign
  REJECTED         // Rejected (can be resubmitted)
  DELEGATED        // Passed to another stream
  ASSIGNED         // Designer assigned
  IN_PROGRESS      // Active work
  PAUSED           // Temporarily halted
  AT_RISK          // Deadline < 24h threshold
  ON_HOLD          // Administrative hold
  COMPLETED        // Terminal — done
  CANCELLED        // Terminal — cancelled
}
```

### JobPriority
```prisma
enum JobPriority {
  LOW
  MEDIUM      // Default
  HIGH
  CRITICAL
}
```

### NotificationType
```prisma
enum NotificationType {
  JOB_SUBMITTED
  JOB_ACCEPTED
  JOB_REJECTED
  JOB_ASSIGNED
  JOB_STATUS_CHANGED
  JOB_AT_RISK
  JOB_DELEGATED
  JOB_COMPLETED
  JOB_CANCELLED
  AI_ACTION_PROPOSED   // Reserved for Phase 6 action AI
  SYSTEM
}
```

### AuditAction
```prisma
enum AuditAction {
  CREATE | UPDATE | DELETE | LOGIN | LOGOUT
  ASSIGN | REASSIGN | REJECT | ACCEPT | DELEGATE
  CANCEL | COMPLETE | PAUSE | RESUME | HOLD | RELEASE
  AI_PROPOSE | AI_EXECUTE | AI_REJECT
  UPLOAD | DOWNLOAD | EXPORT
}
```

### AttachmentType
```prisma
enum AttachmentType {
  JOB_ATTACHMENT   // Reference files from client
  DELIVERABLE      // Designer output files
  EXPORT_REPORT    // System-generated reports
}
```

---

## 3. Models

### User
Core identity model. One user = one role.

```prisma
model User {
  id             String    @id @default(cuid())
  tenantId       String    @default("default")
  email          String    @unique
  passwordHash   String
  firstName      String
  lastName       String
  role           Role      @default(CLIENT)
  avatarUrl      String?
  isActive       Boolean   @default(true)
  workHoursStart String    @default("09:00")
  workHoursEnd   String    @default("17:00")
  timezone       String    @default("UTC")
  lastLoginAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  // Relations
  streamMemberships  StreamMember[]
  submittedJobs      Job[]          @relation("ClientJobs")
  createdJobs        Job[]          @relation("CreatedByJobs")
  assignments        JobAssignment[] @relation("DesignerAssignments")
  assignedByMe       JobAssignment[] @relation("AssignedByAdmin")
  notifications      Notification[]
  auditLogs          AuditLog[]
  refreshTokens      RefreshToken[]
  aiConversations    AiConversation[]

  @@index([tenantId, role])
}
```

**Key notes:**
- `passwordHash` stored as Argon2 hash — never plain text
- `workHoursStart/End` used by timeline view for capacity calculations
- `isActive: false` = soft-deleted — user can no longer login
- `lastLoginAt` updated on every successful login

---

### Stream
A team or business unit that jobs are routed to.

```prisma
model Stream {
  id          String   @id @default(cuid())
  tenantId    String   @default("default")
  name        String
  description String?
  colorHex    String   @default("#6366f1")
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members        StreamMember[]
  jobs           Job[]
  delegationsFrom JobDelegation[] @relation("DelegationFromStream")
  delegationsTo   JobDelegation[] @relation("DelegationToStream")
}
```

**Key notes:**
- `colorHex` used in sidebar, timeline bars, and stream badges
- Default color is the platform's accent indigo `#6366f1`
- Inactive streams hide from job assignment dropdowns

---

### StreamMember
Junction table linking users to streams. A user can be in multiple streams.

```prisma
model StreamMember {
  id         String   @id @default(cuid())
  userId     String
  streamId   String
  isPrimary  Boolean  @default(false)
  assignedAt DateTime @default(now())

  user   User   @relation(fields: [userId], references: [id])
  stream Stream @relation(fields: [streamId], references: [id])

  @@unique([userId, streamId])
}
```

---

### Job
Central model of the entire platform.

```prisma
model Job {
  id              String      @id @default(cuid())
  tenantId        String      @default("default")
  jobNumber       String      @unique
  title           String
  description     String      @db.Text
  status          JobStatus   @default(SUBMITTED)
  priority        JobPriority @default(MEDIUM)
  billingCode     String?
  deadline        DateTime?
  streamId        String?
  clientId        String
  createdById     String
  notes           String?     @db.Text
  rejectionReason String?
  parentJobId     String?
  isAtRisk        Boolean     @default(false)
  atRiskNotifiedAt DateTime?
  delegationCount Int         @default(0)
  completedAt     DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  stream          Stream?            @relation(...)
  client          User               @relation("ClientJobs", ...)
  createdBy       User               @relation("CreatedByJobs", ...)
  assignments     JobAssignment[]
  statusHistory   JobStatusHistory[]
  delegations     JobDelegation[]
  attachments     Attachment[]
  notifications   Notification[]
  auditLogs       AuditLog[]

  @@index([tenantId, status])
  @@index([clientId])
  @@index([streamId, status])
  @@index([deadline])
  @@index([isAtRisk])
  @@index([jobNumber])
}
```

**Key notes:**
- `jobNumber` format: `JB-{YEAR}-{SEQUENCE}` (e.g., `JB-2024-0001`) — generated atomically via `JobSequence`
- `parentJobId` links resubmitted jobs to their rejected predecessor
- `isAtRisk` set by hourly cron when `deadline < now + AT_RISK_THRESHOLD_HOURS`
- `completedAt` set when status transitions to `COMPLETED`
- `delegationCount` max 3 (enforced in `JobsService.delegate()`)

---

### JobAssignment
Links a designer to a job with a time window.

```prisma
model JobAssignment {
  id           String   @id @default(cuid())
  jobId        String
  designerId   String
  assignedById String
  isPrimary    Boolean  @default(false)
  startTime    DateTime
  endTime      DateTime
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  job        Job    @relation(...)
  designer   User   @relation("DesignerAssignments", ...)
  assignedBy User   @relation("AssignedByAdmin", ...)

  @@index([jobId, isActive])
  @@index([designerId, startTime, endTime])
}
```

**Key notes:**
- Max 3 active assignments per job (enforced in service)
- One `isPrimary` per job — auto-set on first assignment
- `isActive: false` = unassigned (not deleted)
- `startTime/endTime` powers the timeline Gantt view

---

### JobAssignmentHistory
Immutable record of past assignments. Append-only.

```prisma
model JobAssignmentHistory {
  id             String    @id @default(cuid())
  jobId          String
  designerId     String
  assignedById   String
  startTime      DateTime
  endTime        DateTime
  isPrimary      Boolean
  unassignedAt   DateTime  @default(now())
  unassignReason String?
}
```

**Visibility:** WORKFLOW_ADMIN + ADMIN only.

---

### JobStatusHistory
Immutable audit trail of every status transition. Append-only.

```prisma
model JobStatusHistory {
  id           String    @id @default(cuid())
  jobId        String
  fromStatus   JobStatus?
  toStatus     JobStatus
  changedById  String?
  isSystem     Boolean   @default(false)
  reason       String?
  changedAt    DateTime  @default(now())

  job Job @relation(...)

  @@index([jobId, changedAt])
}
```

**Key notes:**
- `fromStatus` is null on initial creation (first entry has no "from")
- `isSystem: true` for automated transitions (cron, cascade)
- `reason` required when status = `REJECTED`, optional otherwise

---

### JobDelegation
Records the delegation chain. Max 3 hops.

```prisma
model JobDelegation {
  id             String   @id @default(cuid())
  jobId          String
  fromStreamId   String
  toStreamId     String
  delegatedById  String
  hopNumber      Int
  reason         String?
  delegatedAt    DateTime @default(now())

  job         Job    @relation(...)
  fromStream  Stream @relation("DelegationFromStream", ...)
  toStream    Stream @relation("DelegationToStream", ...)
}
```

---

### Attachment
Files attached to jobs (reference docs, deliverables, reports).

```prisma
model Attachment {
  id           String         @id @default(cuid())
  jobId        String
  uploadedById String
  type         AttachmentType @default(JOB_ATTACHMENT)
  fileName     String
  fileKey      String         @unique
  mimeType     String
  sizeBytes    BigInt
  isDeleted    Boolean        @default(false)
  createdAt    DateTime       @default(now())

  job Job @relation(...)
}
```

**Key notes:**
- `fileKey` = `/uploads/{randomHex}.{ext}` — stored on local disk
- `sizeBytes` is `BigInt` — **serialize to String** before sending to frontend
- Max 5 attachments per job, max 50MB per file
- Soft-delete: `isDeleted: true` — file is not physically removed

---

### Notification
In-app notification for a user.

```prisma
model Notification {
  id        String           @id @default(cuid())
  userId    String
  jobId     String?
  type      NotificationType
  title     String
  message   String
  isRead    Boolean          @default(false)
  readAt    DateTime?
  metadata  Json?
  createdAt DateTime         @default(now())

  @@index([userId, isRead])
  @@index([userId, createdAt(sort: Desc)])
}
```

---

### RefreshToken
Refresh token store with family tracking for reuse detection.

```prisma
model RefreshToken {
  id          String    @id @default(cuid())
  userId      String
  tokenFamily String
  tokenHash   String    @unique
  isRevoked   Boolean   @default(false)
  expiresAt   DateTime
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?

  user User @relation(...)

  @@index([userId])
  @@index([tokenFamily])
}
```

**Security model:**
- `tokenHash` = SHA256 of the raw token — never stored in plain
- `tokenFamily` = UUID grouping tokens in a rotation chain
- If a revoked token is presented, all tokens in the same family are revoked

---

### AuditLog
Immutable, append-only system event log. Retained 12 months.

```prisma
model AuditLog {
  id         String      @id @default(cuid())
  tenantId   String      @default("default")
  actorId    String?
  actorRole  Role?
  isAiAction Boolean     @default(false)
  action     AuditAction
  entityType String
  entityId   String?
  jobId      String?
  before     Json?
  after      Json?
  ipAddress  String?
  userAgent  String?
  requestId  String?
  createdAt  DateTime    @default(now())

  @@index([tenantId, createdAt(sort: Desc)])
  @@index([actorId, createdAt])
  @@index([entityType, entityId])
  @@index([jobId])
}
```

**Status:** Schema defined and indexed. `AuditModule` service/controller not yet implemented.

---

### Setting
Key-value configuration store. Supports secrets.

```prisma
model Setting {
  id          String   @id @default(cuid())
  tenantId    String   @default("default")
  key         String
  value       String   @db.Text
  description String?
  isSecret    Boolean  @default(false)
  updatedById String?
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, key])
}
```

**Seeded settings:**
| Key | Default Value |
|-----|--------------|
| `work_hours_start` | `09:00` |
| `work_hours_end` | `17:00` |
| `job_id_prefix` | `JB` |
| `at_risk_threshold_hours` | `24` |
| `ai_daily_limit` | `100` |
| `gemini_model` | `gemini-2.0-flash` |
| `max_delegation_hops` | `3` |
| `max_designers_per_job` | `3` |
| `max_attachments_per_job` | `5` |
| `max_attachment_size_mb` | `50` |
| `smtp_from` | `noreply@jobtimeline.local` |
| `company_name` | `Acme Design Studio` |

---

### JobSequence
Atomic counter for job number generation.

```prisma
model JobSequence {
  id       String @id @default(cuid())
  tenantId String @default("default")
  year     Int
  sequence Int    @default(0)

  @@unique([tenantId, year])
}
```

**Usage in `JobsService.generateJobNumber()`:**
```typescript
const seq = await this.prisma.jobSequence.upsert({
  where: { tenantId_year: { tenantId: 'default', year } },
  update: { sequence: { increment: 1 } },
  create: { year, sequence: 1 },
});
return `JB-${year}-${String(seq.sequence).padStart(4, '0')}`;
```

---

### AiConversation & AiMessage
Conversation and message store for AI interactions. Currently used for audit trail; not used for context (context is rebuilt from active jobs each request).

```prisma
model AiConversation {
  id        String   @id @default(cuid())
  userId    String
  streamId  String?
  title     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages AiMessage[]
  @@index([userId, createdAt(sort: Desc)])
}

model AiMessage {
  id             String  @id @default(cuid())
  conversationId String
  role           String  // user | assistant | tool_call | tool_result
  content        String  @db.Text
  toolName       String?
  toolInput      Json?
  toolOutput     Json?
  tokensUsed     Int?
  createdAt      DateTime @default(now())

  @@index([conversationId, createdAt])
}
```

---

## 4. Multi-Tenancy Design

Every model has a `tenantId String @default("default")`. The platform is **single-tenant** today but the schema is designed for future multi-tenancy without migration.

**Current behavior:** All queries implicitly use `tenantId: "default"`.

**Future:** When multi-tenancy is needed, add `tenantId` to every query and route all API traffic through tenant-scoped middleware.

---

## 5. Indexing Strategy

All foreign keys and frequently filtered fields are indexed. Key composite indexes:

| Table | Index | Purpose |
|-------|-------|---------|
| User | `(tenantId, role)` | Filter designers by tenant |
| Job | `(tenantId, status)` | Status-filtered lists |
| Job | `(streamId, status)` | WA role-scoped lists |
| Job | `(deadline)` | AT_RISK cron scan |
| Job | `(isAtRisk)` | Dashboard at-risk count |
| JobAssignment | `(jobId, isActive)` | Active assignments per job |
| JobAssignment | `(designerId, startTime, endTime)` | Timeline view overlap detection |
| Notification | `(userId, isRead)` | Unread count queries |
| RefreshToken | `(tokenFamily)` | Family revocation |
| AuditLog | `(tenantId, createdAt DESC)` | Audit feed pagination |

---

## 6. Seeded Demo Data

After running `npm run seed`:

**Users:**
| Email | Role | Password |
|-------|------|---------|
| `admin@jobtimeline.local` | ADMIN | `Admin1234!` |
| `wa.brand@jobtimeline.local` | WORKFLOW_ADMIN | `Password1234!` |
| `wa.digital@jobtimeline.local` | WORKFLOW_ADMIN | `Password1234!` |
| `alex.chen@jobtimeline.local` | DESIGNER | `Password1234!` |
| `sarah.kim@jobtimeline.local` | DESIGNER | `Password1234!` |
| `marcus.jones@jobtimeline.local` | DESIGNER | `Password1234!` |
| `priya.sharma@jobtimeline.local` | DESIGNER | `Password1234!` |
| `client.acme@jobtimeline.local` | CLIENT | `Password1234!` |
| `client.beta@jobtimeline.local` | CLIENT | `Password1234!` |
| `client.gamma@jobtimeline.local` | CLIENT | `Password1234!` |

**Streams:**
- Brand Design (colorHex: `#6366f1`)
- Digital Marketing (colorHex: `#0ea5e9`)

**Jobs:** 10 jobs across various statuses

---

## 7. BigInt Serialization

`Attachment.sizeBytes` is `BigInt` in Prisma. Sending it directly to the frontend throws a JSON serialization error.

**Solution in `AttachmentsService`:**
```typescript
return {
  ...attachment,
  sizeBytes: attachment.sizeBytes.toString()
};
```

Always apply this transform before returning attachment data.

---

## 8. Common Query Patterns

### Role-scoped job list
```typescript
const where: Prisma.JobWhereInput = {};

if (currentUser.role === Role.CLIENT) {
  where.clientId = currentUser.id;
} else if (currentUser.role === Role.DESIGNER) {
  where.assignments = { some: { designerId: currentUser.id, isActive: true } };
} else if (currentUser.role === Role.WORKFLOW_ADMIN) {
  const membership = await this.prisma.streamMember.findFirst({
    where: { userId: currentUser.id }
  });
  where.streamId = membership?.streamId;
}
// ADMIN: no filter (sees all)
```

### Soft-delete filter
```typescript
// Always include in attachment queries
where.isDeleted = false;
```

### Atomic job number generation
```typescript
const seq = await this.prisma.jobSequence.upsert({
  where: { tenantId_year: { tenantId: 'default', year: currentYear } },
  update: { sequence: { increment: 1 } },
  create: { year: currentYear, sequence: 1 },
});
```

### Transactional status change
```typescript
const [updatedJob] = await this.prisma.$transaction([
  this.prisma.job.update({ where: { id }, data: { status, ...metadata } }),
  this.prisma.jobStatusHistory.create({
    data: { jobId: id, fromStatus: currentStatus, toStatus: status, changedById }
  }),
]);
```

---

*Last updated: 2026-06-26*
