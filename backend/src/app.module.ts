import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StreamsModule } from './modules/streams/streams.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    // Config — loads .env, validates all required vars
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting — 100 requests per 60s per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // BullMQ — backed by Redis
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    // Cron / scheduling (used in JobsService for AT_RISK)
    ScheduleModule.forRoot(),

    // Core data layer
    PrismaModule,

    // Domain modules
    AuthModule,
    UsersModule,
    StreamsModule,
    JobsModule,
    AssignmentsModule,
    NotificationsModule,
    SettingsModule,
  ],
})
export class AppModule {}

