import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Minimal context types (decoupled from Prisma) ───────────────────────────

export interface AtRiskJobContext {
  jobNumber: string;
  title: string;
  priority: string;
  deadline: Date | null;
  status: string;
}

export interface DesignerAssignedContext {
  job: { jobNumber: string; title: string };
  designer: { firstName: string; lastName: string };
  startTime: Date;
  endTime: Date;
}

// ─── Slack Block Kit type helpers ────────────────────────────────────────────

interface SlackText {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

interface SlackHeaderBlock {
  type: 'header';
  text: SlackText;
}

interface SlackSectionBlock {
  type: 'section';
  fields: SlackText[];
}

interface SlackContextBlock {
  type: 'context';
  elements: SlackText[];
}

type SlackBlock = SlackHeaderBlock | SlackSectionBlock | SlackContextBlock;

interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

// ─── Priority emoji map ───────────────────────────────────────────────────────

const PRIORITY_EMOJI: Record<string, string> = {
  CRITICAL: ':rotating_light:',
  HIGH: ':fire:',
  MEDIUM: ':large_yellow_circle:',
  LOW: ':white_circle:',
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Fire-and-forget: call with `void this.webhooksService.notifyAtRisk(job)`.
   * Never throws — all errors are caught and logged.
   */
  async notifyAtRisk(job: AtRiskJobContext): Promise<void> {
    const url = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!url) return;

    const payload = this.buildAtRiskPayload(job);
    await this.post(url, payload, `AT_RISK job ${job.jobNumber}`);
  }

  /**
   * Fire-and-forget: call with `void this.webhooksService.notifyDesignerAssigned(ctx)`.
   * Never throws — all errors are caught and logged.
   */
  async notifyDesignerAssigned(ctx: DesignerAssignedContext): Promise<void> {
    const url = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!url) return;

    const payload = this.buildDesignerAssignedPayload(ctx);
    await this.post(url, payload, `designer assigned to ${ctx.job.jobNumber}`);
  }

  // ─── Payload builders ────────────────────────────────────────────────────

  private buildAtRiskPayload(job: AtRiskJobContext): SlackPayload {
    const deadlineStr = job.deadline
      ? job.deadline.toISOString().slice(0, 10)
      : 'No deadline set';
    const priorityEmoji = PRIORITY_EMOJI[job.priority] ?? ':large_blue_circle:';

    return {
      text: `⚠️ Job At Risk: ${job.jobNumber} — ${job.title}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⚠️ Job At Risk Alert', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Job:*\n${job.jobNumber} — ${job.title}` },
            { type: 'mrkdwn', text: `*Priority:*\n${priorityEmoji} ${job.priority}` },
            { type: 'mrkdwn', text: `*Status:*\n${job.status}` },
            { type: 'mrkdwn', text: `*Deadline:*\n${deadlineStr}` },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'This job has crossed the 24-hour deadline threshold and has been automatically flagged as AT_RISK.',
            },
          ],
        },
      ],
    };
  }

  private buildDesignerAssignedPayload(ctx: DesignerAssignedContext): SlackPayload {
    const designerName = `${ctx.designer.firstName} ${ctx.designer.lastName}`;
    const startStr = ctx.startTime.toISOString().slice(0, 10);
    const endStr = ctx.endTime.toISOString().slice(0, 10);

    return {
      text: `✅ ${designerName} assigned to ${ctx.job.jobNumber}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '✅ New Designer Assignment', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Job:*\n${ctx.job.jobNumber} — ${ctx.job.title}` },
            { type: 'mrkdwn', text: `*Designer:*\n${designerName}` },
            { type: 'mrkdwn', text: `*Start:*\n${startStr}` },
            { type: 'mrkdwn', text: `*End:*\n${endStr}` },
          ],
        },
      ],
    };
  }

  // ─── HTTP helper ─────────────────────────────────────────────────────────

  private async post(url: string, payload: SlackPayload, context: string): Promise<void> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.logger.warn(`Slack webhook returned HTTP ${res.status} for ${context}`);
      }
    } catch (error) {
      this.logger.error(
        `Slack webhook POST failed for ${context}: ${(error as Error).message}`,
      );
    }
  }
}
