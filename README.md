# Job Assigning Timeline Management Platform

A professional enterprise-grade job management and timeline scheduling platform.

**Stack:** Next.js 15 · NestJS · PostgreSQL · Redis · Gemini AI · Socket.io  
**Strategy:** Local-first development. Zero cost. Zero credit card required.

---

## 🚀 Quick Start

### Prerequisites

Install these **once** before starting:

| Tool | Download | Why |
|---|---|---|
| **Docker Desktop** | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) | Runs PostgreSQL, Redis, MailHog |
| **Node.js 20+** | [nodejs.org](https://nodejs.org) | Backend + Frontend runtime |
| **Gemini API Key** | [aistudio.google.com](https://aistudio.google.com) | Free AI agent (1,500 req/day, no card) |

---

### 1. Set up environment

```bash
# Copy the example env file
cp .env.example .env

# Add your Gemini API key to .env
# GEMINI_API_KEY=your-key-here
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** → `localhost:5432`
- **Redis** → `localhost:6379`
- **pgAdmin** → [http://localhost:5050](http://localhost:5050) (admin@local.dev / admin)
- **RedisInsight** → [http://localhost:5540](http://localhost:5540)
- **MailHog** → [http://localhost:8025](http://localhost:8025) (view test emails)

### 3. Set up the database

```bash
cd backend

# Run migrations (creates all tables)
npm run migrate:dev

# Seed demo data (users, jobs, streams)
npm run seed
```

### 4. Start the backend

```bash
# From backend/
npm run start:dev
```

API available at → [http://localhost:3001/api](http://localhost:3001/api)  
Swagger docs → [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

### 5. Start the frontend

```bash
# From frontend/
npm run dev
```

App available at → [http://localhost:3000](http://localhost:3000)

---

## 👥 Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@jobtimeline.local | Admin1234! |
| Workflow Admin (Brand) | wa.brand@jobtimeline.local | Password1234! |
| Workflow Admin (Digital) | wa.digital@jobtimeline.local | Password1234! |
| Designer | alex.chen@jobtimeline.local | Password1234! |
| Client | client.acme@jobtimeline.local | Password1234! |

---

## 📂 Project Structure

```
timeline/
├── docker-compose.yml        # Infrastructure (Postgres, Redis, MailHog)
├── .env.example              # Environment variable template
├── .gitignore
├── README.md
│
├── backend/                  # NestJS API (port 3001)
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema (16 models)
│   │   └── seed.ts           # Demo data seed script
│   └── src/
│       ├── main.ts           # Bootstrap
│       ├── app.module.ts     # Root module
│       ├── prisma/           # Database service
│       ├── config/           # Winston, env config
│       └── modules/          # Domain modules (auth, jobs, etc.)
│
└── frontend/                 # Next.js 15 App Router (port 3000)
    └── src/
        ├── app/              # App Router pages
        ├── components/       # Shared UI components
        ├── features/         # Feature-based modules
        ├── hooks/            # Custom React hooks
        ├── services/         # API client layer
        ├── stores/           # Zustand state stores
        └── types/            # TypeScript types
```

---

## 🆓 Zero Cost Stack

| Component | Tool | Cost |
|---|---|---|
| Frontend | Next.js dev server | Free |
| Backend | NestJS dev server | Free |
| Database | PostgreSQL via Docker | Free |
| Cache | Redis via Docker | Free |
| Email testing | MailHog via Docker | Free |
| File uploads | Local disk (Multer) | Free |
| AI Agent | Gemini (Google AI Studio) | Free (1,500 req/day) |

---

## 📋 Job States

`SUBMITTED → UNDER_REVIEW → ACCEPTED → ASSIGNED → IN_PROGRESS → COMPLETED`

Also: `REJECTED`, `DELEGATED`, `PAUSED`, `AT_RISK`, `CANCELLED`, `ON_HOLD`
