# AI_GUIDE.md — AI Agent Implementation

> Documentation for the Gemini-powered AI Workflow Agent.
> Phase 6 implementation: action-capable agent with Gemini function calling and "Proposal, Not Execution" safety model.

---

## 1. Overview

The AI Workflow Agent is a conversational assistant embedded in the platform at `/ai`. It is powered by Google Gemini and has access to the authenticated user's active job context. It provides:

- Job status summaries
- Priority recommendations
- Workflow guidance
- Natural language Q&A about assignments

**Phase 6 capability:** The AI can propose actions (assign designer, change job status) via Gemini function calling. Proposals appear in the chat UI for user confirmation before execution. The AI never directly calls write APIs — the user's browser executes the confirmed action under their own JWT, keeping all authorization guarantees intact.

---

## 2. Technical Stack

| Component | Technology |
|-----------|-----------|
| AI Model | Google Gemini 2.5 Pro |
| SDK | `@google/genai` v2.10 |
| API Key Source | `https://aistudio.google.com` (free tier) |
| Rate Limiting | 10 requests per 60 seconds per IP |
| Backend Module | `backend/src/modules/ai/` |
| Frontend Page | `frontend/src/app/(app)/ai/page.tsx` |

---

## 3. Backend Implementation

### Files
```
backend/src/modules/ai/
├── ai.module.ts        ← Module definition
├── ai.service.ts       ← Gemini integration
└── ai.controller.ts    ← HTTP endpoint
```

### AiService — `processQuery()`

```typescript
async processQuery(userId: string, query: string, history: ChatMessage[]): Promise<{ reply: string }>
```

**Step 1: Context Building**

Fetches the authenticated user's active job assignments:
```typescript
const jobs = await this.prisma.job.findMany({
  where: {
    assignments: {
      some: { designerId: userId, isActive: true }
    },
    status: { in: ['ASSIGNED', 'IN_PROGRESS', 'AT_RISK'] }
  },
  select: { jobNumber: true, title: true, deadline: true, status: true }
})
```

Formats into context string:
```
- JB-2024-0001: Nike Campaign Design (IN_PROGRESS, due: 2024-02-01)
- JB-2024-0003: Annual Report Layout (AT_RISK, due: 2024-01-16)
```

**Step 2: System Prompt**
```
You are a helpful assistant for a Job Timeline Management Platform.
You assist designers and workflow admins.
The user currently has these active jobs:
{contextStr}

Help the user manage their tasks, explain priorities, and provide short, actionable answers.
```

**Step 3: Generate Response**
```typescript
const contents = [
  ...formattedHistory,
  { role: 'user', parts: [{ text: query }] }
]

const response = await this.ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents,
  config: {
    systemInstruction,
    temperature: 0.7
  }
})

return { reply: response.text }
```

**Temperature 0.7:** Balanced between creative and deterministic. Suitable for advisory responses.

---

### AiController

```
POST /api/ai/chat
Guards: JwtAuthGuard + ThrottlerGuard
```

**Request DTO:**
```typescript
class AiChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query: string

  @IsArray()
  @IsOptional()
  history?: Array<{ role: string; content: string }>
}
```

**Rate limit:** 10 requests per 60 seconds per IP (separate `@UseGuards(ThrottlerGuard)`)

---

## 4. Frontend Implementation

**File:** `frontend/src/app/(app)/ai/page.tsx`

### Chat Interface Layout

```
┌─────────────────────────────────────────────┐
│  AI Workflow Agent                          │
├─────────────────────────────────────────────┤
│                                             │
│  [Assistant bubble]                         │
│  Welcome! I'm your AI assistant...          │
│                                             │
│                 [User bubble]               │
│                 Which job is most urgent?   │
│                                             │
│  [Assistant bubble]                         │
│  Based on your active jobs, **JB-2024-003** │
│  has the closest deadline...                │
│                                             │
├─────────────────────────────────────────────┤
│  [Input field] [Send button]                │
└─────────────────────────────────────────────┘
```

### Message Rendering
- User messages: right-aligned, accent background
- Assistant messages: left-aligned, elevated background, **rendered as Markdown** via `react-markdown`
- Auto-scrolls to bottom on new message

### History Management
- Full conversation history maintained in React state
- Sent with every request to provide multi-turn conversation context
- Not persisted between page navigations (Phase 6 improvement)

### API Call
```typescript
const response = await aiApi.chat(inputValue, conversationHistory)
// Appends { role: 'assistant', content: response.data.reply } to history
```

---

## 5. Data Models (Schema-Ready, Not Yet Used)

The database schema defines conversation persistence models for future use:

### AiConversation
```prisma
model AiConversation {
  id        String     @id @default(cuid())
  userId    String
  streamId  String?
  title     String?
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  messages  AiMessage[]
}
```

### AiMessage
```prisma
model AiMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // user | assistant | tool_call | tool_result
  content        String   @db.Text
  toolName       String?
  toolInput      Json?
  toolOutput     Json?
  tokensUsed     Int?
  createdAt      DateTime @default(now())
}
```

**Current status:** Schema defined, not populated. The live chat sends history per-request; there is no DB persistence of conversations.

---

## 6. Phase 6 Roadmap — Action-Oriented AI

The schema already defines the `AiActionProposal` frontend type and `AI_ACTION_PROPOSED` notification type in preparation for Phase 6.

### Proposed Action Flow

```
User: "Assign JB-2024-0001 to Alex Chen"
  ↓
AI generates an AiActionProposal:
  {
    type: "assign_job",
    description: "Assign JB-2024-0001 (Nike Campaign) to Alex Chen",
    payload: { jobId: "...", designerId: "..." },
    reasoning: "Alex has capacity and is primary in Brand Design",
    expiresAt: "2024-01-15T10:05:00.000Z"
  }
  ↓
UI shows confirmation card:
  "AI proposes to: Assign Nike Campaign to Alex Chen
  [Approve] [Reject]"
  ↓
User approves → Call /api/assignments { jobId, designerId }
  ↓
Result notification: "AI executed: Assignment created"
```

### Required for Phase 6

1. **Tool definitions** for Gemini function calling:
   - `assign_job(jobId, designerId, startTime, endTime)`
   - `change_job_status(jobId, status, reason?)`
   - `reassign_job(assignmentId, newDesignerId)`
   - `delegate_job(jobId, toStreamId, reason)`

2. **`AiActionsService`** to handle proposal lifecycle

3. **Confirmation UI component** for proposal cards

4. **`AI_ACTION_PROPOSED` notification** to alert relevant users

5. **Role restrictions:** Only ADMIN + WORKFLOW_ADMIN can approve AI actions

---

## 7. Configuration

**Environment Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (required) | Get from https://aistudio.google.com |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Model to use |
| `AI_DAILY_LIMIT_PER_USER` | `100` | Reserved for future per-user rate limiting |

**Getting an API Key:**
1. Go to https://aistudio.google.com
2. Click "Get API Key" → "Create API key in new project"
3. Copy the key
4. Add to `backend/.env`: `GEMINI_API_KEY=your-key-here`

**Free tier limits:**
- 1,500 requests/day for Gemini 2.0 Flash
- No billing account required for development

---

## 8. Known Issues & Improvements

| Issue | Severity | Phase |
|-------|---------|-------|
| Two Google AI SDKs installed (`@google/genai` + `@google/generative-ai`) | Low | Remove unused `@google/generative-ai` in Phase 5 cleanup |
| No conversation persistence (lost on page refresh) | Medium | Phase 6 — use AiConversation model |
| Context limited to active jobs only (not full workflow history) | Medium | Phase 6 — expand context window |
| No per-user daily limit enforcement (only IP-based throttle) | Low | Phase 6 — use `AI_DAILY_LIMIT_PER_USER` setting |
| AI has no awareness of team capacity or stream workload | Medium | Phase 6 — inject AnalyticsService data into context |

---

*Last updated: 2026-06-26*
