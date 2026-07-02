import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { JobStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HistoryEntryDto } from './dto/chat.dto';

// ─── Output types ─────────────────────────────────────────────────────────────

export type AiActionName =
  | 'assign_designer_to_job'
  | 'change_job_status'
  | 'create_job'
  | 'update_job_priority'
  | 'update_job_deadline'
  | 'add_job_note'
  | 'remove_assignment';

export interface AiActionProposal {
  id: string;
  action: AiActionName;
  description: string;
  reasoning: string;
  payload: {
    jobId?: string;
    jobNumber?: string;
    designerId?: string;
    designerName?: string;
    startTime?: string;
    endTime?: string;
    newStatus?: string;
    newPriority?: string;
    newDeadline?: string;
    note?: string;
    title?: string;
    description?: string;
    assignmentId?: string;
  };
  expiresAt: string;
}

export interface AiResponse {
  reply: string;
  proposal?: AiActionProposal;
}

// ─── Context item types ────────────────────────────────────────────────────────

interface JobContextItem {
  id: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: string;
  deadline: Date | null;
  isAtRisk: boolean;
  stream: { name: string } | null;
}

interface DesignerAssignmentItem {
  startTime: Date;
  endTime: Date;
  job: { jobNumber: string };
}

interface DesignerContextItem {
  id: string;
  firstName: string;
  lastName: string;
  _count: { assignments: number };
  assignments: DesignerAssignmentItem[];
}

// ─── Action tool names (all tools that produce a proposal) ────────────────────

const ACTION_TOOLS = new Set<string>([
  'assign_designer_to_job',
  'change_job_status',
  'create_job',
  'update_job_priority',
  'update_job_deadline',
  'add_job_note',
  'remove_assignment',
]);

// ─── OpenAI-compatible tool declarations ──────────────────────────────────────

const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'assign_designer_to_job',
      description:
        'Assigns a designer to a job. Call this when the user wants to create a designer assignment. Returns a proposal the user must confirm before it executes.',
      parameters: {
        type: 'object',
        properties: {
          jobId:        { type: 'string', description: 'Exact job UUID from the context list' },
          jobNumber:    { type: 'string', description: 'Job number (e.g. JB-2026-0001) for display' },
          designerId:   { type: 'string', description: 'Exact designer user UUID from the context list' },
          designerName: { type: 'string', description: 'Designer full name for display' },
          startTime:    { type: 'string', description: 'Assignment start as UTC ISO 8601 datetime. IMPORTANT: the user speaks in their local timezone (shown in the system prompt header). Convert their local time to UTC before setting this field. Example: if user is UTC+05:30 and says "1pm", set "T07:30:00Z".' },
          endTime:      { type: 'string', description: 'Assignment end as UTC ISO 8601 datetime. Same timezone conversion rule as startTime applies.' },
        },
        required: ['jobId', 'jobNumber', 'designerId', 'designerName', 'startTime', 'endTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_job_status',
      description:
        'Changes the status of a job. Call this when the user wants to transition a job to a different status. Valid values: UNDER_REVIEW, ACCEPTED, REJECTED, ASSIGNED, IN_PROGRESS, PAUSED, AT_RISK, COMPLETED, CANCELLED. Returns a proposal the user must confirm before it executes.',
      parameters: {
        type: 'object',
        properties: {
          jobId:     { type: 'string', description: 'Exact job UUID from the context list' },
          jobNumber: { type: 'string', description: 'Job number (e.g. JB-2026-0001) for display' },
          newStatus: { type: 'string', description: 'Target JobStatus value' },
        },
        required: ['jobId', 'jobNumber', 'newStatus'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_job',
      description:
        'Proposes drafting a new job on behalf of the user. Returns a proposal the user must confirm before it executes.',
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string', description: 'A concise, descriptive title for the new job' },
          description: { type: 'string', description: 'Full description of the work to be done' },
          priority:    { type: 'string', description: 'Job priority: LOW, MEDIUM, HIGH, or CRITICAL' },
        },
        required: ['title', 'description', 'priority'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_job_priority',
      description:
        'Changes the priority of an existing job. Returns a proposal the user must confirm before it executes.',
      parameters: {
        type: 'object',
        properties: {
          jobId:       { type: 'string', description: 'Exact job UUID from the context list' },
          jobNumber:   { type: 'string', description: 'Job number (e.g. JB-2026-0001) for display' },
          newPriority: { type: 'string', description: 'New priority: LOW, MEDIUM, HIGH, or CRITICAL' },
        },
        required: ['jobId', 'jobNumber', 'newPriority'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_job_deadline',
      description:
        'Updates the deadline of a job. Returns a proposal the user must confirm before it executes.',
      parameters: {
        type: 'object',
        properties: {
          jobId:       { type: 'string', description: 'Exact job UUID from the context list' },
          jobNumber:   { type: 'string', description: 'Job number (e.g. JB-2026-0001) for display' },
          newDeadline: { type: 'string', description: 'New deadline as ISO 8601 datetime (e.g. 2026-08-01T17:00:00Z)' },
        },
        required: ['jobId', 'jobNumber', 'newDeadline'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_job_note',
      description:
        'Appends an internal note to a job for tracking purposes. Returns a proposal the user must confirm before it executes.',
      parameters: {
        type: 'object',
        properties: {
          jobId:     { type: 'string', description: 'Exact job UUID from the context list' },
          jobNumber: { type: 'string', description: 'Job number (e.g. JB-2026-0001) for display' },
          note:      { type: 'string', description: 'The note text to append to the job' },
        },
        required: ['jobId', 'jobNumber', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_assignment',
      description:
        'Removes a designer from a job assignment. Returns a proposal the user must confirm before it executes.',
      parameters: {
        type: 'object',
        properties: {
          jobId:      { type: 'string', description: 'Exact job UUID from the context list' },
          jobNumber:  { type: 'string', description: 'Job number (e.g. JB-2026-0001) for display' },
          designerId: { type: 'string', description: 'Exact designer user UUID to remove' },
        },
        required: ['jobId', 'jobNumber', 'designerId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_jobs',
      description:
        'Searches the database for a specific job number (e.g., JB-2026-0011) if it is not found in the ACTIVE JOBS context list. Returns the job details.',
      parameters: {
        type: 'object',
        properties: {
          jobNumber: { type: 'string', description: 'The job number to search for, e.g. JB-2026-0011' },
        },
        required: ['jobNumber'],
      },
    },
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

const MAX_TOOL_LOOPS = 3;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly ai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.ai = new OpenAI({
      apiKey: this.configService.get<string>('GROQ_API_KEY') ?? 'dummy-key-for-dev',
      baseURL: 'https://api.groq.com/openai/v1',
    });
    this.model = this.configService.get<string>('GROQ_MODEL') ?? 'llama3-70b-8192';
  }

  async processQuery(
    userId: string,
    userRole: string,
    query: string,
    history: HistoryEntryDto[],
    timezone?: string,
    tzOffset?: string,
  ): Promise<AiResponse> {
    try {
      const [jobs, designers] = await Promise.all([
        this.getJobContext(userId, userRole),
        this.getDesignerContext(),
      ]);

      const systemInstruction = this.buildSystemInstruction(jobs, designers, timezone, tzOffset);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemInstruction },
        ...history.map(h => ({
          role: h.role,
          content: h.content,
        } as OpenAI.Chat.ChatCompletionMessageParam)),
        { role: 'user', content: query },
      ];

      for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
        const response = await this.ai.chat.completions.create({
          model: this.model,
          messages,
          tools: AI_TOOLS,
          tool_choice: 'auto',
          temperature: 0.7,
        });

        const message = response.choices[0]?.message;
        const toolCall = message?.tool_calls?.[0];

        if (!toolCall || toolCall.type !== 'function') {
          return { reply: message?.content ?? 'I was unable to generate a response. Please try again.' };
        }

        const name = toolCall.function.name;
        let args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

        // Action tools → build proposal and return immediately (Proposal, Not Execution model)
        if (ACTION_TOOLS.has(name)) {
          // For remove_assignment: resolve the actual DB assignmentId from jobId + designerId
          if (name === 'remove_assignment' && args.jobId && args.designerId) {
            const activeAssignment = await this.prisma.jobAssignment.findFirst({
              where: {
                jobId:      String(args.jobId),
                designerId: String(args.designerId),
                isActive:   true,
              },
              select: { id: true },
            });
            args = { ...args, assignmentId: activeAssignment?.id ?? '' };
          }

          const reply = message.content ?? this.describeAction(name, args);
          return { reply, proposal: this.buildProposal(name as AiActionName, args, reply) };
        }

        // search_jobs → resolve, append messages, loop
        if (name === 'search_jobs') {
          const jobNumber = String(args.jobNumber ?? '');
          const job = await this.prisma.job.findFirst({
            where: { jobNumber },
            select: {
              id: true,
              jobNumber: true,
              title: true,
              status: true,
              priority: true,
              deadline: true,
              isAtRisk: true,
              stream: { select: { name: true } },
              assignments: {
                where: { isActive: true },
                select: {
                  designerId: true,
                  designer: { select: { firstName: true, lastName: true } },
                },
              },
            },
          });

          messages.push(message as OpenAI.Chat.ChatCompletionMessageParam);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: job
              ? JSON.stringify(job)
              : JSON.stringify({ error: `No job found with number ${jobNumber}` }),
          });
          continue;
        }

        // Unknown tool — return whatever text the model provided
        return { reply: message.content ?? 'I was unable to generate a response. Please try again.' };
      }

      return { reply: 'I was unable to complete the request within the allowed steps. Please try again.' };
    } catch (error) {
      this.logger.error(`AI query failed: ${(error as Error).message}`, (error as Error).stack);
      return { reply: "I'm having trouble connecting right now. Please try again later." };
    }
  }

  private async getJobContext(userId: string, userRole: string): Promise<JobContextItem[]> {
    const excludedStatuses: JobStatus[] = [JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.REJECTED];
    const where =
      userRole === Role.DESIGNER
        ? {
            assignments: { some: { designerId: userId, isActive: true } },
            status: { notIn: excludedStatuses },
          }
        : { status: { notIn: excludedStatuses } };

    return this.prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        jobNumber: true,
        title: true,
        status: true,
        priority: true,
        deadline: true,
        isAtRisk: true,
        stream: { select: { name: true } },
      },
    });
  }

  private async getDesignerContext(): Promise<DesignerContextItem[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return this.prisma.user.findMany({
      where: { role: Role.DESIGNER, isActive: true },
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        // Count only assignments that overlap with today
        _count: { select: { assignments: { where: { isActive: true, startTime: { lte: todayEnd }, endTime: { gte: todayStart } } } } },
        // Fetch all assignments from today onwards (today's blocks + upcoming)
        assignments: {
          where: { isActive: true, endTime: { gte: todayStart } },
          orderBy: { startTime: 'asc' },
          select: {
            startTime: true,
            endTime: true,
            job: { select: { jobNumber: true } },
          },
        },
      },
    });
  }

  /** Derive UTC offset string (e.g. "+05:30") from an IANA timezone name. */
  private deriveOffsetFromIANA(date: Date, iana: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: iana,
        timeZoneName: 'shortOffset',
      }).formatToParts(date);
      const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+0';
      const raw = offsetPart.replace('GMT', '') || '+0';
      const [hStr, mStr = '0'] = raw.replace(/^[+-]/, '').split(':');
      const sign  = raw.startsWith('-') ? '-' : '+';
      const hours = String(parseInt(hStr, 10)).padStart(2, '0');
      const mins  = String(parseInt(mStr, 10)).padStart(2, '0');
      return `${sign}${hours}:${mins}`;
    } catch {
      return '+00:00';
    }
  }

  /** Format a Date as a local ISO-8601 string with the given UTC offset appended. */
  private formatWithOffset(date: Date, iana: string, offsetStr: string): string {
    try {
      // sv-SE locale gives "YYYY-MM-DD HH:MM:SS" — clean for ISO conversion
      const localStr = date.toLocaleString('sv-SE', { timeZone: iana });
      return localStr.replace(' ', 'T') + offsetStr;
    } catch {
      const mins = this.parseOffsetToMinutes(offsetStr);
      return new Date(date.getTime() + mins * 60000).toISOString().slice(0, 19) + offsetStr;
    }
  }

  /** Parse "+05:30" or "-08:00" to total minutes (e.g. 330 or -480). */
  private parseOffsetToMinutes(offset: string): number {
    const match = offset.match(/^([+-])(\d{1,2}):(\d{2})$/);
    if (!match) return 0;
    const [, sign, h, m] = match;
    const total = parseInt(h, 10) * 60 + parseInt(m, 10);
    return sign === '-' ? -total : total;
  }

  private buildSystemInstruction(
    jobs: JobContextItem[],
    designers: DesignerContextItem[],
    timezone?: string,
    tzOffset?: string,
  ): string {
    // ── Compute a local-time string with the correct UTC offset ──────────────
    // Priority: browser-supplied timezone > browser-supplied offset > server local
    const rawNow = new Date();
    let localDateStr: string;
    let ianaName: string;
    let offsetStr: string;

    if (timezone) {
      // Best case: browser sent its IANA timezone name (e.g. "Asia/Kolkata")
      ianaName  = timezone;
      offsetStr = tzOffset ?? this.deriveOffsetFromIANA(rawNow, timezone);
      localDateStr = this.formatWithOffset(rawNow, timezone, offsetStr);
    } else if (tzOffset) {
      // Fallback: browser sent raw offset string (e.g. "+05:30") but no IANA name
      ianaName     = `UTC${tzOffset}`;
      offsetStr    = tzOffset;
      const mins   = this.parseOffsetToMinutes(tzOffset);
      localDateStr = new Date(rawNow.getTime() + mins * 60000)
        .toISOString().slice(0, 19) + tzOffset;
    } else {
      // Last resort: derive from server's own timezone
      const serverOffsetMin = -rawNow.getTimezoneOffset();
      const sign   = serverOffsetMin >= 0 ? '+' : '-';
      const absMin = Math.abs(serverOffsetMin);
      offsetStr    = `${sign}${String(Math.floor(absMin / 60)).padStart(2, '0')}:${String(absMin % 60).padStart(2, '0')}`;
      ianaName     = Intl.DateTimeFormat().resolvedOptions().timeZone;
      localDateStr = new Date(rawNow.getTime() + serverOffsetMin * 60000)
        .toISOString().slice(0, 19) + offsetStr;
    }

    const now = `${localDateStr} (${ianaName})`; // e.g. "2026-07-02T09:30:00+05:30 (Asia/Kolkata)"

    const jobList = jobs.length
      ? jobs
          .map(
            j =>
              `  ID:${j.id} | ${j.jobNumber}: "${j.title}" | ${j.status} | ${j.priority}` +
              (j.deadline ? ` | Due:${j.deadline.toISOString().slice(0, 10)}` : '') +
              (j.isAtRisk ? ' | ⚠️AT-RISK' : '') +
              (j.stream ? ` | Stream:${j.stream.name}` : ''),
          )
          .join('\n')
      : '  (no active jobs)';

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const designerList = designers.length
      ? designers
          .map(d => {
            // Split fetched assignments into today vs upcoming
            const todayBlocks = d.assignments.filter(
              a => a.startTime <= todayEnd && a.endTime >= todayStart,
            );
            const upcoming = d.assignments.filter(a => a.startTime > todayEnd);

            const todayStr = todayBlocks.length
              ? todayBlocks
                  .map(a => {
                    const start = a.startTime.toISOString().slice(11, 16);
                    const end   = a.endTime.toISOString().slice(11, 16);
                    return `${a.job.jobNumber} ${start}–${end}`;
                  })
                  .join(', ')
              : 'none';

            const upcomingStr = upcoming.length
              ? upcoming
                  .map(a => {
                    const start = a.startTime.toISOString().slice(0, 16).replace('T', ' ');
                    const end   = a.endTime.toISOString().slice(0, 16).replace('T', ' ');
                    return `${a.job.jobNumber} (${start} – ${end})`;
                  })
                  .join(', ')
              : 'none';

            return `  ID:${d.id} | ${d.firstName} ${d.lastName} | Busy Today: ${d._count.assignments > 0 ? 'Yes' : 'No'} | Today's Blocks:[${todayStr}] | Upcoming:[${upcomingStr}]`;
          })
          .join('\n')
      : '  (no designers available)';

    return `Current Date: ${now}

You are a formal, professional Workflow Coordinator for a Job Timeline Management Platform.
Your role is to assist admins and workflow managers in overseeing job progress, managing designer assignments, and optimising workflow operations.

ACTIVE JOBS (use exact internal UUIDs for tool calls):
${jobList}

DESIGNER ROSTER (use exact internal UUIDs for tool calls — check Schedule field for availability):
${designerList}

OPERATIONAL RULES:
- You are a helpful workflow assistant. If a user asks about anything entirely unrelated to job management, designers, or workflow operations, politely decline and steer the conversation back to timeline management. Do not use robotic fallback phrases.
- Respond in a professional, consultative tone. Keep your answers concise and conversational.
- Be proactive in conversation only — surface insights in plain text and ask if the user wants help. Do NOT call any tool or generate a proposal unless the user explicitly confirms they want an action taken.
- NEVER expose internal UUIDs (e.g., cmqsf...) or raw database integers to the user in your conversational replies. Use UUIDs exclusively as arguments for tool calls.
- Use tools when the user requests or consents to an action.
- If a job number is mentioned but not found in the ACTIVE JOBS list above, call search_jobs first to look it up before proceeding.
- All proposals require explicit user confirmation in the UI before any action is executed. You never execute changes directly.
- A designer is free today only if their Busy Today field is No. The Today's Blocks field lists the exact time ranges (HH:MM–HH:MM) the designer is occupied today — use these to answer time-specific questions (e.g., "Is Alex free from 1pm to 4pm?"). The Upcoming field shows future assignments for planning purposes only and does not affect today's availability.
- If a user requests an action but does not provide all required details (e.g., which job, which designer, what dates), ask one clarifying question to collect the missing information. Never pick or guess values on the user's behalf.
- Never assume or generate startTime or endTime for an assignment. Always ask the user to confirm the date range before creating an assignment proposal.
- Do not generate an assign_designer_to_job proposal unless you have all four values confirmed by the user: jobId, designerId, startTime, and endTime. If any are missing, ask for them first.
- You can only propose assigning a designer to a job if the job's status is UNDER_REVIEW, ACCEPTED, ASSIGNED, or IN_PROGRESS. For any other status, inform the user the job is not in an assignable state and do not generate an assignment proposal.
- TIMEZONE: The user's local date/time and timezone are shown in the header above (e.g. "2026-07-02T09:30:00+05:30 (Asia/Kolkata)"). ALL times the user mentions ("1pm", "4pm", "tomorrow at noon") are in THEIR local timezone. You MUST convert every user-specified time to UTC before setting startTime or endTime in tool call arguments. Conversely, when mentioning times back to the user in conversation, always express them in the user's local timezone shown above — never in UTC. Conversion example (UTC+05:30): "1pm local" → T07:30:00Z | "4pm local" → T10:30:00Z.
- When answering a factual question (e.g., "is X free?", "what is the status of job Y?"), give a direct answer in 1–2 sentences. If uncertain, state so in one sentence and ask what the user would like to do next.
- Valid job priority values: LOW, MEDIUM, HIGH, CRITICAL.
- Valid job status values: UNDER_REVIEW, ACCEPTED, REJECTED, ASSIGNED, IN_PROGRESS, PAUSED, AT_RISK, COMPLETED, CANCELLED.`;
  }

  private describeAction(name?: string, args?: Record<string, unknown>): string {
    switch (name) {
      case 'assign_designer_to_job':
        return `I propose assigning **${args?.designerName ?? 'a designer'}** to job **${args?.jobNumber ?? 'a job'}**. Please review and confirm the proposal below.`;
      case 'change_job_status':
        return `I propose transitioning **${args?.jobNumber ?? 'a job'}** to status **${args?.newStatus ?? 'a new status'}**. Please review and confirm the proposal below.`;
      case 'create_job':
        return `I propose creating a new **${args?.priority ?? ''}** priority job titled **"${args?.title ?? 'Untitled'}"**. Please review and confirm the proposal below.`;
      case 'update_job_priority':
        return `I propose updating the priority of **${args?.jobNumber ?? 'a job'}** to **${args?.newPriority ?? 'a new priority'}**. Please review and confirm the proposal below.`;
      case 'update_job_deadline':
        return `I propose updating the deadline of **${args?.jobNumber ?? 'a job'}** to **${args?.newDeadline ?? 'a new date'}**. Please review and confirm the proposal below.`;
      case 'add_job_note':
        return `I propose appending the following note to **${args?.jobNumber ?? 'a job'}**. Please review and confirm the proposal below.`;
      case 'remove_assignment':
        return `I propose removing the designer assignment from job **${args?.jobNumber ?? 'a job'}**. Please review and confirm the proposal below.`;
      default:
        return 'I have a proposed action ready. Please review and confirm it below.';
    }
  }

  private buildProposal(
    name: AiActionName,
    args?: Record<string, unknown>,
    reasoning?: string,
  ): AiActionProposal {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const base = { id, action: name, reasoning: reasoning ?? '', expiresAt };

    switch (name) {
      case 'assign_designer_to_job':
        return {
          ...base,
          description: `Assign ${args?.designerName ?? 'designer'} to ${args?.jobNumber ?? 'job'}`,
          payload: {
            jobId:        String(args?.jobId ?? ''),
            jobNumber:    String(args?.jobNumber ?? ''),
            designerId:   String(args?.designerId ?? ''),
            designerName: String(args?.designerName ?? ''),
            startTime:    String(args?.startTime ?? ''),
            endTime:      String(args?.endTime ?? ''),
          },
        };
      case 'change_job_status':
        return {
          ...base,
          description: `Change ${args?.jobNumber ?? 'job'} status to ${args?.newStatus ?? 'new status'}`,
          payload: {
            jobId:     String(args?.jobId ?? ''),
            jobNumber: String(args?.jobNumber ?? ''),
            newStatus: String(args?.newStatus ?? ''),
          },
        };
      case 'create_job':
        return {
          ...base,
          description: `Create new job: "${args?.title ?? 'Untitled'}" (${args?.priority ?? 'MEDIUM'})`,
          payload: {
            title:       String(args?.title ?? ''),
            description: String(args?.description ?? ''),
            newPriority: String(args?.priority ?? 'MEDIUM'),
          },
        };
      case 'update_job_priority':
        return {
          ...base,
          description: `Update priority of ${args?.jobNumber ?? 'job'} to ${args?.newPriority ?? 'new priority'}`,
          payload: {
            jobId:       String(args?.jobId ?? ''),
            jobNumber:   String(args?.jobNumber ?? ''),
            newPriority: String(args?.newPriority ?? ''),
          },
        };
      case 'update_job_deadline':
        return {
          ...base,
          description: `Update deadline of ${args?.jobNumber ?? 'job'} to ${args?.newDeadline ?? 'new date'}`,
          payload: {
            jobId:       String(args?.jobId ?? ''),
            jobNumber:   String(args?.jobNumber ?? ''),
            newDeadline: String(args?.newDeadline ?? ''),
          },
        };
      case 'add_job_note':
        return {
          ...base,
          description: `Add note to ${args?.jobNumber ?? 'job'}`,
          payload: {
            jobId:     String(args?.jobId ?? ''),
            jobNumber: String(args?.jobNumber ?? ''),
            note:      String(args?.note ?? ''),
          },
        };
      case 'remove_assignment':
        return {
          ...base,
          description: `Remove designer assignment from ${args?.jobNumber ?? 'job'}`,
          payload: {
            jobId:        String(args?.jobId ?? ''),
            jobNumber:    String(args?.jobNumber ?? ''),
            designerId:   String(args?.designerId ?? ''),
            assignmentId: String(args?.assignmentId ?? ''),
          },
        };
    }
  }
}
