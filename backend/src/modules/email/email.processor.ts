import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { EMAIL_TRANSPORTER } from './email.constants';
import { JobCompletedEmailData } from './email.service';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Inject(EMAIL_TRANSPORTER) private readonly transporter: nodemailer.Transporter,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<JobCompletedEmailData>): Promise<void> {
    switch (job.name) {
      case 'job-completed':
        await this.sendJobCompleted(job.data);
        break;
      default:
        this.logger.warn(`Unknown email job type received: ${job.name}`);
    }
  }

  private async sendJobCompleted(data: JobCompletedEmailData): Promise<void> {
    const from = this.configService.get<string>(
      'SMTP_FROM',
      '"Job Timeline" <noreply@jobtimeline.local>',
    );

    await this.transporter.sendMail({
      from,
      to: data.to,
      subject: `Your job ${data.jobNumber} is complete`,
      html: this.renderJobCompleted(data),
    });

    this.logger.log(`Sent job-completed email to ${data.to} for ${data.jobNumber}`);
  }

  private renderJobCompleted(data: JobCompletedEmailData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#6366f1;padding:32px 40px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.3px;">
        ✅ Job Complete
      </h1>
    </div>

    <div style="padding:32px 40px;">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${data.clientName},</p>
      <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.65;">
        Great news — your job has been completed and is ready for review.
      </p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px 24px;margin:0 0 28px;">
        <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.07em;">Job Reference</p>
        <p style="margin:0 0 4px;color:#111827;font-size:20px;font-weight:700;">${data.jobNumber}</p>
        <p style="margin:0;color:#4b5563;font-size:14px;">${data.jobTitle}</p>
      </div>

      <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">
        Log in to the platform to view deliverables, leave feedback, or download files.
      </p>
    </div>

    <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Job Timeline Platform &mdash; This is an automated notification. Please do not reply.
      </p>
    </div>

  </div>
</body>
</html>`;
  }
}
