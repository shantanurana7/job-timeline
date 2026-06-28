# SECURITY.md — Security Practices

> Security posture documentation for the Job Timeline Platform.
> Covers current protections, known gaps, and hardening roadmap.

---

## 1. Current Security Controls

### 1.1 Transport & HTTP
| Control | Implementation | Status |
|---------|---------------|--------|
| Security headers | `helmet` middleware (global) | Active |
| CORS | Origin locked to `FRONTEND_URL` env var | Active |
| HTTPS | None (local dev only) | Missing in prod |
| Content Security Policy | Not configured | Gap |

**Helmet headers applied:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy`
- `Strict-Transport-Security` (HSTS)

---

### 1.2 Authentication
| Control | Implementation | Status |
|---------|---------------|--------|
| Password hashing | Argon2 (async, memory-hard) | Active |
| Access token lifetime | 15 minutes | Active |
| Refresh token storage (server) | SHA256 hash — plain token never stored | Active |
| Refresh token reuse detection | Entire family revoked on reuse | Active |
| JWT algorithm | HS256 with strong secrets | Active |
| Account deactivation check | `isActive` verified on every request | Active |

**Token security model:**
```
Plain refresh token → never stored in DB
           ↓
    SHA256 hash → stored as tokenHash
           ↓
    tokenFamily groups all tokens in a rotation chain
           ↓
    If revoked token presented → revoke all tokens in family
```

---

### 1.3 Authorization
| Control | Implementation | Status |
|---------|---------------|--------|
| JWT validation | `JwtAuthGuard` on all protected routes | Active |
| Role-based access | `RolesGuard` + `@Roles()` decorator | Active |
| Role-scoped DB queries | Enforced in service layer (not just controller) | Active |
| WORKFLOW_ADMIN stream scope | Stream membership checked in job queries | Active |

---

### 1.4 Input Validation
| Control | Implementation | Status |
|---------|---------------|--------|
| DTO validation | `class-validator` + global `ValidationPipe` | Active |
| Property whitelist | `whitelist: true` strips unknown fields | Active |
| Unknown property rejection | `forbidNonWhitelisted: true` → 400 | Active |
| Type coercion | `transform: true` auto-converts types | Active |
| File type validation | Multer MIME type filter | Active |
| File size limit | 50MB hard limit in Multer | Active |

---

### 1.5 Rate Limiting
| Endpoint | Limit | Guard |
|----------|-------|-------|
| All endpoints | 100 req/60s per IP | `ThrottlerGuard` (global) |
| `POST /api/ai/chat` | 10 req/60s per IP | `@UseGuards(ThrottlerGuard)` |

---

### 1.6 Data Protection
| Control | Implementation | Status |
|---------|---------------|--------|
| Secret settings | `isSecret: true` hides from list API | Active |
| Sensitive env vars | `ConfigService` only — never hardcoded | Active |
| Error response sanitization | `AllExceptionsFilter` — no stack traces in 5xx | Active |
| Audit logging schema | `AuditLog` model designed | Schema only |
| Soft deletes | Attachments use `isDeleted` flag | Active |

---

## 2. Known Security Gaps

### HIGH

**1. Socket.io CORS set to `origin: '*'`**
- **File:** `backend/src/modules/notifications/notifications.gateway.ts`
- **Risk:** Any origin can establish a WebSocket connection
- **Fix:**
  ```typescript
  @WebSocketGateway({
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  })
  ```

**2. Refresh token in localStorage**
- **File:** `frontend/src/app/login/page.tsx`
- **Risk:** XSS attacks can steal refresh token from localStorage
- **Fix for production:** Use HTTP-only cookies for refresh token storage
  ```typescript
  // Backend: Set cookie in auth response
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  })
  ```

---

### MEDIUM

**3. No Content Security Policy**
- **Risk:** XSS attacks can execute arbitrary scripts
- **Fix:** Add CSP via Helmet configuration:
  ```typescript
  app.use(helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'ws://localhost:3001'],
    },
  }))
  ```

**4. AuditLog not populated**
- **Risk:** No audit trail for security-relevant actions
- **Files:** `backend/src/modules/audit/` (empty)
- **Fix:** Implement AuditService, inject into jobs/auth/users services

**5. JWT secrets in `.env.example` are weak placeholders**
- **File:** `.env.example` shows `change-me-in-production-access-secret`
- **Risk:** Developers may forget to change these
- **Fix:** Add startup validation that rejects weak secrets in production:
  ```typescript
  if (process.env.NODE_ENV === 'production') {
    if (jwtSecret.length < 64) throw new Error('JWT_ACCESS_SECRET too short')
  }
  ```

**6. No HTTPS in local environment**
- **Risk:** Tokens transmitted in plain text on local network
- **Note:** Acceptable for local dev, must be fixed for any deployment

---

### LOW

**7. ThrottlerModule imported twice in app.module.ts**
- **Risk:** Unpredictable rate limiting behavior (second import wins)
- **Fix:** Remove duplicate import, use single configured ThrottlerModule

**8. File upload without antivirus scanning**
- **Risk:** Malicious files could be uploaded
- **Mitigation:** Files are stored locally and served as downloads — not executed
- **Future:** Integrate ClamAV or similar for scanning deliverable files

**9. pgAdmin and RedisInsight exposed without HTTPS**
- **Risk:** Admin UIs accessible on local network
- **Mitigation:** Development only — never expose in production

---

## 3. Hardening Checklist for Production

Before any production deployment, complete all of the following:

### Environment
- [ ] Generate strong JWT secrets: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] Set `NODE_ENV=production`
- [ ] Set `FRONTEND_URL` to the actual production domain
- [ ] Remove `SMTP_USER/PASS` placeholders and configure real SMTP

### Transport
- [ ] Enable HTTPS (TLS certificate via nginx/cloud LB)
- [ ] Enable HSTS with preload
- [ ] Configure Content Security Policy
- [ ] Disable Swagger UI (automatic in production via `NODE_ENV` check)

### Authentication
- [ ] Switch refresh tokens from localStorage to HTTP-only cookies
- [ ] Fix Socket.io CORS to use `FRONTEND_URL`
- [ ] Set shorter token expiry for sensitive operations

### Infrastructure
- [ ] Set Redis password (`REDIS_PASSWORD` env var)
- [ ] Restrict pgAdmin and RedisInsight to internal network only
- [ ] Enable PostgreSQL SSL connection
- [ ] Set file upload directory outside web root

### Monitoring
- [ ] Implement AuditLog population
- [ ] Set up log aggregation (e.g., ship Winston JSON logs to ELK/Datadog)
- [ ] Configure alerting on 5xx error rate spikes

---

## 4. Security Contacts

**Reporting vulnerabilities:** Open a private issue on the repository with label `security`.

---

*Last updated: 2026-06-26*
