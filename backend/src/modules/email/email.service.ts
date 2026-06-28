import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface JobCompletedEmailData {
  to: string;
  clientName: string;
  jobNumber: string;
  jobTitle: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  async addJobCompletedEmail(data: JobCompletedEmailData): Promise<void> {
    try {
      await this.emailQueue.add('job-completed', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      });
      this.logger.log(`Queued job-completed email for ${data.jobNumber} → ${data.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue job-completed email for ${data.jobNumber}: ${(error as Error).message}`,
      );
    }
  }
}
