import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { EmailProcessor } from './email.processor';
import { EMAIL_TRANSPORTER } from './email.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'email' }),
  ],
  providers: [
    {
      provide: EMAIL_TRANSPORTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        nodemailer.createTransport({
          host: config.get<string>('SMTP_HOST', 'localhost'),
          port: config.get<number>('SMTP_PORT', 1025),
          secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
          ...(config.get<string>('SMTP_USER')
            ? {
                auth: {
                  user: config.get<string>('SMTP_USER'),
                  pass: config.get<string>('SMTP_PASS'),
                },
              }
            : {}),
        }),
    },
    EmailService,
    EmailProcessor,
  ],
  exports: [EmailService],
})
export class EmailModule {}
