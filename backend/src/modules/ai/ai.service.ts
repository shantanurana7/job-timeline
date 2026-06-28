import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { JobStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HistoryEntryDto } from './dto/chat.dto';

// ─── Output types ─────────────────────────────────────────────────────────────

export type AiActionName = 'assign_designer_to_job' | 'change_job_status';

export interface AiActionProposal {
  id: string;
  action: AiActionName;
  description: string;
  reasoning: string;
  payload: {
    jobId: string;
    jobNumber: string;
    designerId?: string;
    designerName?: string;
    startTime?: string;
    endTime?: string;
    newStatus?: string;
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
          startTime:    { type: 'string', description: 'Assignment start as ISO 8601 datetime (e.g. 2026-07-01T09:00:00Z)' },
          endTime:      { type: 'string', description: 'Assignment end as ISO 8601 datetime (e.g. 2026-07-05T17:00:00Z)' },
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
  ): Promise<AiResponse> {
    try {
      const [jobs, designers] = await Promise.all([
        this.getJobContext(userId, userRole),
        this.getDesignerContext(),
      ]);

      const systemInstruction = this.buildSystemInstruction(jobs, designers);

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
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

        // Action tools → build proposal and return immediately
        if (name === 'assign_designer_to_job' || name === 'change_job_status') {
          const reply = message.content ?? this.describeAction(name, args);
          return { reply, proposal: this.buildProposal(name, args, reply) };
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
    return this.prisma.user.findMany({
      where: { role: Role.DESIGNER, isActive: true },
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        _count: { select: { assignments: { where: { isActive: true } } } },
        assignments: {
          where: { isActive: true, startTime: { gte: new Date() } },
          select: {
            startTime: true,
            endTime: true,
            job: { select: { jobNumber: true } },
          },
        },
      },
    });
  }

  private buildSystemInstruction(jobs: JobContextItem[], designers: DesignerContextItem[]): string {
    const now = new Date().toISOString();

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

    const designerList = designers.length
      ? designers
          .map(d => {
            const scheduleStr = d.assignments.length
              ? d.assignments
                  .map(a => {
                    const start = a.startTime.toISOString().slice(0, 16).replace('T', ' ');
                    const end = a.endTime.toISOString().slice(0, 16).replace('T', ' ');
                    return `${a.job.jobNumber} (${start} - ${end})`;
                  })
                  .join(', ')
              : 'none';
            return `  ID:${d.id} | ${d.firstName} ${d.lastName} | Active:${d._count.assignments} | Schedule:[${scheduleStr}]`;
          })
          .join('\n')
      : '  (no designers available)';

    return `Current Date: ${now}

You are an AI workflow assistant for a Job Timeline Management Platform.
You help admins and workflow managers view and manage jobs and designer assignments.

ACTIVE JOBS (use exact internal UUIDs for tool calls):
${jobList}

AVAILABLE DESIGNERS (use exact internal UUIDs for tool calls):
${designerList}

RULES:
- Answer questions about jobs and workflow concisely.
- Use the tools ONLY when the user clearly requests an action (assign a designer, change a status).
- If a job number is mentioned but not found in the ACTIVE JOBS list above, call search_jobs first to look it up before proceeding.
- NEVER fabricate UUIDs — only use the 'id' field visible in the context above or returned by search_jobs.
- IMPORTANT: The 'jobId' field in tools MUST be the internal UUID (e.g., cmq... ), NOT the job number (e.g., JB-2026-0011).
- Proposals are shown to the user for confirmation before execution.`;
  }

  private describeAction(name?: string, args?: Record<string, unknown>): string {
    if (name === 'assign_designer_to_job') {
      return `I'd like to assign **${args?.designerName ?? 'a designer'}** to job **${args?.jobNumber ?? 'a job'}**. Please review and confirm the proposal below.`;
    }
    if (name === 'change_job_status') {
      return `I'd like to change **${args?.jobNumber ?? 'a job'}** to status **${args?.newStatus ?? 'a new status'}**. Please review and confirm the proposal below.`;
    }
    return 'I have a proposed action ready. Please review and confirm it below.';
  }

  private buildProposal(
    name?: string,
    args?: Record<string, unknown>,
    reasoning?: string,
  ): AiActionProposal {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    if (name === 'assign_designer_to_job') {
      return {
        id,
        action: 'assign_designer_to_job',
        description: `Assign ${args?.designerName ?? 'designer'} to ${args?.jobNumber ?? 'job'}`,
        reasoning: reasoning ?? '',
        payload: {
          jobId:        String(args?.jobId ?? ''),
          jobNumber:    String(args?.jobNumber ?? ''),
          designerId:   String(args?.designerId ?? ''),
          designerName: String(args?.designerName ?? ''),
          startTime:    String(args?.startTime ?? ''),
          endTime:      String(args?.endTime ?? ''),
        },
        expiresAt,
      };
    }

    return {
      id,
      action: 'change_job_status',
      description: `Change ${args?.jobNumber ?? 'job'} status to ${args?.newStatus ?? 'new status'}`,
      reasoning: reasoning ?? '',
      payload: {
        jobId:     String(args?.jobId ?? ''),
        jobNumber: String(args?.jobNumber ?? ''),
        newStatus: String(args?.newStatus ?? ''),
      },
      expiresAt,
    };
  }
}
