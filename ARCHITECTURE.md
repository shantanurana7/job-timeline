# ARCHITECTURE.md — System Design

> Comprehensive architectural documentation for the Job Assigning Timeline Management Platform.
> Every significant design decision is recorded here with rationale.

---

## 1. System Overview

The platform is a decoupled full-stack monorepo:
- **Backend:** NestJS API + Socket.io WebSocket server (port 3001)
- **Frontend:** Next.js App Router SPA (port 3000)
- **Infrastructure:** PostgreSQL + Redis + tooling (all Docker)

```mermaid
graph TB
    subgraph Browser
        FE[Next.js Frontend<br/>port 3000]
    end

    subgraph Backend ["NestJS Backend (port 3001)"]
        API[REST API Layer<br/>/api/*]
        WS[Socket.io Gateway<br/>NotificationsGateway]
        SVC[Domain Services]
        AI[AI Module<br/>Gemini]
    end

    subgraph Infrastructure
        PG[(PostgreSQL 16<br/>port 5432)]
        RD[(Redis 7<br/>port 6379)]
        MH[MailHog SMTP<br/>port 1025]
    end

    subgraph External
        GEM[Google Gemini API]
    end

    FE -->|HTTP/REST + JWT| API
    FE <-->|WebSocket + JWT| WS
    API --> SVC
    WS --> SVC
    SVC --> PG
    SVC --> RD
    AI -->|HTTPS| GEM
    SVC --> MH
```

---

## 2. Backend Architecture

### 2.1 Module Dependency Graph

```mermaid
graph TD
    AppModule --> ConfigModule
    AppModule --> ThrottlerModule
    AppModule --> BullModule
    AppModule --> ScheduleModule
    AppModule --> CacheModule
    AppModule --> PrismaModule

    AppModule --> AuthModule
    AppModule --> UsersModule
    AppModule --> StreamsModule
    AppModule --> JobsModule
    AppModule --> AssignmentsModule
    AppModule --> NotificationsModule
    AppModule --> SettingsModule
    AppModule --> AnalyticsModule
    AppModule --> AttachmentsModule
    AppModule --> AiModule

    JobsModule -->|imports| NotificationsModule
    AssignmentsModule -->|imports| NotificationsModule
    NotificationsModule -->|imports| JwtModule
    AuthModule -->|exports| PassportModule
    AuthModule -->|exports| JwtStrategy
```

### 2.2 Request Lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Middleware<br/>(Helmet, CORS)
    participant G as Guards<br/>(JWT, Roles, Throttler)
    participant P as Pipes<br/>(ValidationPipe)
    participant CT as Controller
    participant SV as Service
    participant PR as Prisma
    participant DB as PostgreSQL

    C->>MW: HTTP Request
    MW->>G: Pass through
    G->>G: JwtAuthGuard validates Bearer token
    G->>G: RolesGuard checks @Roles() metadata
    G->>G: ThrottlerGuard checks rate limit
    G->>P: Pass to pipes
    P->>P: ValidationPipe validates DTO
    P->>CT: @Body(), @Param(), @Query() injected
    CT->>SV: Call service method
    SV->>PR: Query database
    PR->>DB: SQL
    DB-->>PR: Result
    PR-->>SV: Typed result
    SV-->>CT: Business object
    CT-->>C: ApiResponse.ok(data)
```

### 2.3 Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as AuthController
    participant AS as AuthService
    participant DB as PostgreSQL

    C->>A: POST /api/auth/login<br/>{ email, password }
    A->>AS: login(dto)
    AS->>DB: findUnique by email
    DB-->>AS: User record
    AS->>AS: argon2.verify(passwordHash, password)
    AS->>DB: update lastLoginAt
    AS->>AS: generateTokens(userId, email, role)
    AS->>DB: create RefreshToken<br/>{ tokenFamily, tokenHash (SHA256), expiresAt }
    AS-->>A: { accessToken, refreshToken, user }
    A-->>C: 200 OK

    Note over C: Store refreshToken in localStorage<br/>Keep accessToken in memory only

    C->>A: POST /api/auth/refresh<br/>{ refreshToken }
    A->>AS: refresh(refreshToken)
    AS->>AS: SHA256 hash incoming token
    AS->>DB: findUnique by tokenHash
    alt Token is revoked
        AS->>DB: Revoke entire tokenFamily
        AS-->>C: 403 Forbidden
    else Token is valid
        AS->>DB: Mark old token revoked
        AS->>AS: Generate new token pair (same family)
        AS->>DB: Create new RefreshToken
        AS-->>C: 200 OK { newAccessToken, newRefreshToken }
    end
```

### 2.4 Job Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED : Client submits job

    SUBMITTED --> UNDER_REVIEW : WA/Admin reviews
    SUBMITTED --> CANCELLED : Cancelled

    UNDER_REVIEW --> ACCEPTED : WA/Admin accepts
    UNDER_REVIEW --> REJECTED : WA/Admin rejects
    UNDER_REVIEW --> CANCELLED : Cancelled

    REJECTED --> SUBMITTED : Client resubmits

    ACCEPTED --> ASSIGNED : Designer assigned (auto)
    ACCEPTED --> DELEGATED : Delegated to another stream
    ACCEPTED --> CANCELLED : Cancelled

    DELEGATED --> ASSIGNED : Designer assigned
    DELEGATED --> CANCELLED : Cancelled

    ASSIGNED --> IN_PROGRESS : Designer starts work
    ASSIGNED --> PAUSED : Work paused
    ASSIGNED --> AT_RISK : Deadline < 24h (auto/manual)
    ASSIGNED --> CANCELLED : Cancelled

    IN_PROGRESS --> COMPLETED : Work done ✓
    IN_PROGRESS --> PAUSED : Work paused
    IN_PROGRESS --> AT_RISK : Deadline < 24h (auto/manual)
    IN_PROGRESS --> CANCELLED : Cancelled

    PAUSED --> IN_PROGRESS : Work resumed
    PAUSED --> CANCELLED : Cancelled

    AT_RISK --> COMPLETED : Work done despite risk ✓
    AT_RISK --> PAUSED : Escalation
    AT_RISK --> CANCELLED : Cancelled

    ON_HOLD --> IN_PROGRESS : Released from hold
    ON_HOLD --> CANCELLED : Cancelled

    COMPLETED --> [*]
    CANCELLED --> [*]
```

### 2.5 WebSocket Connection Flow

```mermaid
sequenceDiagram
    participant C as Client Browser
    participant G as NotificationsGateway
    participant NS as NotificationsService
    participant DB as PostgreSQL

    C->>G: socket.connect({ auth: { token: accessToken } })
    G->>G: JwtService.verify(token)
    alt Invalid token
        G-->>C: Disconnect
    else Valid token
        G->>G: userSockets.set(userId, Set<socketId>)
        G->>G: client.join('user_${userId}')
        alt User is ADMIN
            G->>G: client.join('admin_room')
        end
        G->>NS: getUnreadCount(userId)
        NS->>DB: count({ userId, isRead: false })
        DB-->>NS: count
        G-->>C: emit('notification:unread_count', { count })
    end

    Note over C,G: Later — designer assigned to job

    G->>NS: create({ userId, type: JOB_ASSIGNED, ... })
    NS->>DB: notification.create(...)
    G->>C: emit to 'user_${userId}' room<br/>'notification:new' + updated count
```

---

## 3. Frontend Architecture

### 3.1 Route Structure

```mermaid
graph TD
    ROOT[app/layout.tsx<br/>Global: ToastContainer]
    ROOT --> LOGIN[login/page.tsx<br/>Public]
    ROOT --> APP["(app)/layout.tsx<br/>Protected: AuthProvider + Sidebar + Topbar"]

    APP --> DASH[dashboard/page.tsx<br/>KPIs + Activity]
    APP --> JOBS[jobs/page.tsx<br/>Job list + filters]
    APP --> NEWJOB[jobs/new/page.tsx<br/>Submit job form]
    APP --> JOBDETAIL["jobs/[id]/page.tsx<br/>Detail + history + attachments"]
    APP --> TIMELINE[timeline/page.tsx<br/>Designer Gantt view]
    APP --> NOTIF[notifications/page.tsx<br/>Notification center]
    APP --> AI[ai/page.tsx<br/>Gemini chat]
    APP --> USERS[admin/users/page.tsx<br/>Team management]
    APP --> STREAMS[admin/streams/page.tsx<br/>Stream management]
    APP --> SETTINGS[admin/settings/page.tsx<br/>KV config]
```

### 3.2 State & Data Flow

```mermaid
graph LR
    subgraph "Zustand Stores"
        AUTH[auth.store<br/>user, isAuthenticated]
        TOAST[toast.store<br/>toasts queue]
    end

    subgraph "API Layer"
        AC[apiClient<br/>Axios instance]
        SVC[services/index.ts<br/>jobsApi, usersApi, etc.]
    end

    subgraph "Real-time"
        SOCK[useSocket hook<br/>Socket.io singleton]
    end

    subgraph "Pages"
        PAGE[page.tsx<br/>useState loading/error/data]
    end

    PAGE -->|calls| SVC
    SVC -->|HTTP + Bearer| AC
    AC -->|on 401: refresh then retry| AUTH
    SOCK -->|notification:new| PAGE
    SOCK -->|job:status_changed| PAGE
    PAGE -->|on error| TOAST
    AUTH -->|setUser| PAGE
```

### 3.3 Authentication Bootstrap

```mermaid
sequenceDiagram
    participant B as Browser
    participant AP as AuthProvider
    participant AS as auth.store
    participant API as api.ts

    B->>AP: Mount (page load)
    AP->>AP: Check localStorage for 'refreshToken'
    alt No refreshToken
        AP->>B: Redirect to /login
    else refreshToken exists
        AP->>API: authApi.refresh(refreshToken)
        API-->>AP: { accessToken, user }
        AP->>AS: setUser(user, accessToken)
        AP->>B: Render protected content
    end
```

---

## 4. Database Architecture

### 4.1 Entity Relationship Diagram

```mermaid
erDiagram
    User {
        string id PK
        string email UK
        string passwordHash
        Role role
        string firstName
        string lastName
        boolean isActive
        string workHoursStart
        string workHoursEnd
    }

    Stream {
        string id PK
        string name
        string colorHex
        boolean isActive
    }

    StreamMember {
        string id PK
        string userId FK
        string streamId FK
        boolean isPrimary
    }

    Job {
        string id PK
        string jobNumber UK
        string title
        JobStatus status
        JobPriority priority
        string streamId FK
        string clientId FK
        boolean isAtRisk
        int delegationCount
    }

    JobAssignment {
        string id PK
        string jobId FK
        string designerId FK
        string assignedById FK
        boolean isPrimary
        boolean isActive
        datetime startTime
        datetime endTime
    }

    JobStatusHistory {
        string id PK
        string jobId FK
        JobStatus fromStatus
        JobStatus toStatus
        string changedById FK
        boolean isSystem
        string reason
    }

    JobDelegation {
        string id PK
        string jobId FK
        string fromStreamId FK
        string toStreamId FK
        int hopNumber
        string reason
    }

    Attachment {
        string id PK
        string jobId FK
        string fileKey UK
        string mimeType
        bigint sizeBytes
        boolean isDeleted
    }

    Notification {
        string id PK
        string userId FK
        string jobId FK
        NotificationType type
        boolean isRead
    }

    RefreshToken {
        string id PK
        string userId FK
        string tokenFamily
        string tokenHash UK
        boolean isRevoked
        datetime expiresAt
    }

    AuditLog {
        string id PK
        string actorId FK
        AuditAction action
        string entityType
        json before
        json after
    }

    User ||--o{ StreamMember : "belongs to"
    Stream ||--o{ StreamMember : "has"
    User ||--o{ Job : "submits (client)"
    Stream ||--o{ Job : "owns"
    Job ||--o{ JobAssignment : "has"
    User ||--o{ JobAssignment : "receives (designer)"
    Job ||--o{ JobStatusHistory : "has"
    Job ||--o{ JobDelegation : "has"
    Job ||--o{ Attachment : "has"
    User ||--o{ Notification : "receives"
    User ||--o{ RefreshToken : "has"
    User ||--o{ AuditLog : "generates"
```

---

## 5. Infrastructure Architecture

### 5.1 Docker Services

```mermaid
graph LR
    subgraph Docker["docker-compose.yml"]
        PG["PostgreSQL 16<br/>timeline_postgres<br/>:5432"]
        RD["Redis 7<br/>timeline_redis<br/>:6379"]
        PGA["pgAdmin 4<br/>timeline_pgadmin<br/>:5050"]
        RDI["RedisInsight<br/>timeline_redisinsight<br/>:5540"]
        MH["MailHog<br/>timeline_mailhog<br/>:8025 (UI)<br/>:1025 (SMTP)"]
    end

    subgraph App["Application (not in Docker)"]
        BE["NestJS Backend<br/>:3001"]
        FE["Next.js Frontend<br/>:3000"]
    end

    BE --> PG
    BE --> RD
    BE --> MH
    PGA --> PG
    RDI --> RD
```

**Why not containerize the app?** Local development with hot-reload works better outside Docker. The infrastructure services (stateful) are containerized; the application (stateless) runs natively for fast iteration.

---

## 6. Security Architecture

### 6.1 Token Security Model

```
┌─────────────────────────────────────────────────────────┐
│  Access Token (JWT)                                      │
│  ├── Lifetime: 15 minutes                               │
│  ├── Signed with: JWT_ACCESS_SECRET                     │
│  ├── Payload: { sub, email, role, iat, exp }            │
│  ├── Storage: Memory only (Zustand store)               │
│  └── Transmission: Authorization: Bearer <token>        │
│                                                          │
│  Refresh Token                                          │
│  ├── Lifetime: 7 days                                   │
│  ├── Format: Random UUID                                │
│  ├── Storage (client): localStorage                     │
│  ├── Storage (server): SHA256 hash in PostgreSQL        │
│  ├── Token Family: UUID grouping for rotation detection │
│  └── Reuse Detection: Revokes entire family on reuse   │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Defense Layers

```
Request
  │
  ▼
[1] Helmet — HTTP security headers (XSS, clickjacking, MIME sniffing)
  │
  ▼
[2] CORS — Origin whitelist (FRONTEND_URL only)
  │
  ▼
[3] ThrottlerGuard — Rate limiting (100/60s general, 10/60s AI)
  │
  ▼
[4] JwtAuthGuard — Bearer token validation + user existence check
  │
  ▼
[5] RolesGuard — Role-based access control
  │
  ▼
[6] ValidationPipe — DTO validation, whitelist, forbid unknown
  │
  ▼
[7] Service logic — Role-scoped DB queries
  │
  ▼
[8] AllExceptionsFilter — Sanitized error responses (no stack traces)
```

---

## 7. Caching Architecture

```
GET /api/jobs (user A)
  │
  ▼
UserCacheInterceptor
  ├── Generates cache key: "userA_id:/api/jobs?status=..."
  ├── Check Redis
  │   ├── HIT → return cached result (max 10s stale)
  │   └── MISS → proceed to service → cache result
  └── TTL: 10 seconds

GET /api/analytics/dashboard (any user)
  │
  ▼
@CacheTTL(30) on controller method
  ├── Cache key: "/api/analytics/dashboard"
  ├── Shared across all users (public KPIs)
  └── TTL: 30 seconds
```

**Cache Invalidation Strategy:** TTL-only. Cache entries expire naturally. There is no explicit invalidation on write. For 10s on jobs and 30s on analytics, this is acceptable for the current load.

---

## 8. AI Architecture

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend /ai page
    participant AC as AiController
    participant AS as AiService
    participant DB as PostgreSQL
    participant GM as Gemini API

    U->>FE: Types message
    FE->>AC: POST /api/ai/chat<br/>{ query, history }
    AC->>AC: ThrottlerGuard (10/60s)
    AC->>AS: processQuery(userId, query, history)
    AS->>DB: Find user's active job assignments
    DB-->>AS: Active jobs with context
    AS->>AS: Build system prompt with job context
    AS->>GM: generateContent({ contents, systemInstruction })
    GM-->>AS: Response text
    AS-->>AC: { reply: string }
    AC-->>FE: { success: true, data: { reply } }
    FE->>FE: Append to chat, render Markdown
    FE-->>U: Display AI response
```

**Current limitation:** AI is read-only. It can discuss jobs but cannot execute actions. Phase 6 will add an `AiActionProposal` flow with human confirmation before execution.

---

## 9. Real-time Architecture

```mermaid
graph TD
    subgraph Events["Events That Trigger Notifications"]
        ASSIGN["Designer assigned to job<br/>(AssignmentsService.assign)"]
        STATUS["Job status changed<br/>(JobsService.changeStatus)"]
        ATRISK["Job flagged at-risk<br/>(JobsService.flagAtRiskJobs CRON)"]
    end

    subgraph Gateway["NotificationsGateway (Socket.io)"]
        PERSONAL["Personal Room<br/>user_{userId}"]
        ADMIN["Admin Room<br/>admin_room"]
    end

    ASSIGN -->|"sendToUser(designerId)"| PERSONAL
    STATUS -->|"broadcastJobUpdate()"| ADMIN
    ATRISK -->|"sendToUser(affectedUsers)"| PERSONAL

    subgraph Frontend["Frontend Listeners"]
        TOPBAR["Topbar<br/>notification:unread_count"]
        NOTIFPAGE["Notifications Page<br/>notification:new"]
    end

    PERSONAL --> TOPBAR
    PERSONAL --> NOTIFPAGE
```

---

## 10. Scalability Considerations

**Current:** Single-node, single-tenant. All state in one PostgreSQL + Redis.

**Phase 5+ path to scale:**

| Concern | Current | Scale Path |
|---------|---------|-----------|
| Database | Single PG instance | Read replicas, connection pooling via PgBouncer |
| Cache | Redis single node | Redis Cluster or Sentinel |
| File storage | Local disk `./uploads` | AWS S3 / GCS (Multer storage adapter swap) |
| Email | MailHog local | SendGrid / AWS SES (SMTP config swap) |
| Background jobs | BullMQ configured, no consumers | Add consumers for email, export, reports |
| Multi-tenancy | Single tenant (`tenantId: "default"`) | Row-level tenancy already designed in schema |
| AI | Single Gemini model | Add model selection, conversation persistence |

---

*Last updated: 2026-06-26*
