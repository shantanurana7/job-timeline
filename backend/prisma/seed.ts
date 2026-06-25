/**
 * Prisma Seed Script
 * Populates the database with demo data for development.
 *
 * Run: npx prisma db seed
 * Or:  npm run seed
 */

import { PrismaClient, Role, JobStatus, JobPriority } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

async function main() {
  console.log('🌱 Starting seed...\n');

  // ── Clean existing data ──────────────────────────────────────────
  console.log('🧹 Cleaning existing data...');
  await prisma.aiMessage.deleteMany();
  await prisma.aiConversation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.jobAssignmentHistory.deleteMany();
  await prisma.jobAssignment.deleteMany();
  await prisma.jobDelegation.deleteMany();
  await prisma.jobStatusHistory.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.deliverable.deleteMany();
  await prisma.job.deleteMany();
  await prisma.streamMember.deleteMany();
  await prisma.stream.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.jobSequence.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Cleaned\n');

  // ── Users ────────────────────────────────────────────────────────
  console.log('👤 Creating users...');

  const adminPassword = await hashPassword('Admin1234!');
  const defaultPassword = await hashPassword('Password1234!');

  const admin = await prisma.user.create({
    data: {
      email: 'admin@jobtimeline.local',
      passwordHash: adminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const workflowAdmin1 = await prisma.user.create({
    data: {
      email: 'wa.brand@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'Sarah',
      lastName: 'Mitchell',
      role: Role.WORKFLOW_ADMIN,
      isActive: true,
    },
  });

  const workflowAdmin2 = await prisma.user.create({
    data: {
      email: 'wa.digital@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'James',
      lastName: 'Thornton',
      role: Role.WORKFLOW_ADMIN,
      isActive: true,
    },
  });

  const designer1 = await prisma.user.create({
    data: {
      email: 'alex.chen@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'Alex',
      lastName: 'Chen',
      role: Role.DESIGNER,
      workHoursStart: '09:00',
      workHoursEnd: '17:00',
      isActive: true,
    },
  });

  const designer2 = await prisma.user.create({
    data: {
      email: 'priya.sharma@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'Priya',
      lastName: 'Sharma',
      role: Role.DESIGNER,
      workHoursStart: '10:00',
      workHoursEnd: '18:00',
      isActive: true,
    },
  });

  const designer3 = await prisma.user.create({
    data: {
      email: 'marcus.lee@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'Marcus',
      lastName: 'Lee',
      role: Role.DESIGNER,
      workHoursStart: '09:00',
      workHoursEnd: '17:00',
      isActive: true,
    },
  });

  const designer4 = await prisma.user.create({
    data: {
      email: 'nina.okafor@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'Nina',
      lastName: 'Okafor',
      role: Role.DESIGNER,
      workHoursStart: '08:00',
      workHoursEnd: '16:00',
      isActive: true,
    },
  });

  const client1 = await prisma.user.create({
    data: {
      email: 'client.acme@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'Tom',
      lastName: 'Walker',
      role: Role.CLIENT,
      isActive: true,
    },
  });

  const client2 = await prisma.user.create({
    data: {
      email: 'client.globex@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'Lisa',
      lastName: 'Monroe',
      role: Role.CLIENT,
      isActive: true,
    },
  });

  const client3 = await prisma.user.create({
    data: {
      email: 'client.initech@jobtimeline.local',
      passwordHash: defaultPassword,
      firstName: 'David',
      lastName: 'Park',
      role: Role.CLIENT,
      isActive: true,
    },
  });

  console.log(`✅ Created ${10} users\n`);

  // ── Streams ──────────────────────────────────────────────────────
  console.log('🌊 Creating streams...');

  const brandStream = await prisma.stream.create({
    data: {
      name: 'Brand Design',
      description: 'Brand identity, logos, print, and marketing materials',
      colorHex: '#6366f1',
      isActive: true,
    },
  });

  const digitalStream = await prisma.stream.create({
    data: {
      name: 'Digital Marketing',
      description: 'Social media, digital ads, email templates, and web assets',
      colorHex: '#ec4899',
      isActive: true,
    },
  });

  // Assign members to streams
  await prisma.streamMember.createMany({
    data: [
      { userId: workflowAdmin1.id, streamId: brandStream.id, isPrimary: true },
      { userId: designer1.id, streamId: brandStream.id, isPrimary: true },
      { userId: designer2.id, streamId: brandStream.id, isPrimary: true },
      { userId: workflowAdmin2.id, streamId: digitalStream.id, isPrimary: true },
      { userId: designer3.id, streamId: digitalStream.id, isPrimary: true },
      { userId: designer4.id, streamId: digitalStream.id, isPrimary: true },
    ],
  });

  console.log(`✅ Created 2 streams with members\n`);

  // ── Job Sequence ─────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  await prisma.jobSequence.create({
    data: { year: currentYear, sequence: 10 },
  });

  // ── Jobs ─────────────────────────────────────────────────────────
  console.log('💼 Creating jobs...');

  const now = new Date();
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  const job1 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0011`,
      title: 'Annual Report 2024 Cover Design',
      description: 'Need a premium annual report cover design. Corporate blue/gold theme. Must include company logo prominently.',
      status: JobStatus.IN_PROGRESS,
      priority: JobPriority.HIGH,
      billingCode: 'ACME2024AR',
      deadline: daysFromNow(5),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
    },
  });

  const job2 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0012`,
      title: 'Q4 Social Media Campaign Pack',
      description: 'Instagram and LinkedIn post templates for Q4 campaign. 10 templates total, brand guidelines attached.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.MEDIUM,
      billingCode: 'GLOBEX-Q4',
      deadline: daysFromNow(14),
      streamId: digitalStream.id,
      clientId: client2.id,
      createdById: admin.id,
    },
  });

  const job3 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0013`,
      title: 'Product Launch Email Template',
      description: 'HTML email template for new product launch. Must be mobile-responsive. Dark mode support required.',
      status: JobStatus.AT_RISK,
      priority: JobPriority.CRITICAL,
      billingCode: 'INITECH-EM',
      deadline: daysFromNow(1),
      streamId: digitalStream.id,
      clientId: client3.id,
      createdById: admin.id,
      isAtRisk: true,
    },
  });

  const job4 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0014`,
      title: 'Brand Logo Refresh',
      description: 'Modernize existing logo. Keep brand recognition but update for digital-first. Deliver SVG, PNG, and brand guidelines update.',
      status: JobStatus.UNDER_REVIEW,
      priority: JobPriority.HIGH,
      deadline: daysFromNow(21),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
    },
  });

  const job5 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0015`,
      title: 'Trade Show Banner Set',
      description: '3x pull-up banners for upcoming trade show. 2000x800mm print-ready files required.',
      status: JobStatus.SUBMITTED,
      priority: JobPriority.MEDIUM,
      deadline: daysFromNow(30),
      streamId: brandStream.id,
      clientId: client2.id,
      createdById: admin.id,
    },
  });

  const job6 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0016`,
      title: 'Website Hero Section Redesign',
      description: 'Redesign homepage hero section. Must convert well on mobile. Provide Figma source files.',
      status: JobStatus.COMPLETED,
      priority: JobPriority.MEDIUM,
      billingCode: 'INITECH-WEB',
      deadline: daysFromNow(-7),
      streamId: digitalStream.id,
      clientId: client3.id,
      createdById: admin.id,
      completedAt: daysFromNow(-8),
    },
  });

  const job7 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0017`,
      title: 'Employee Onboarding Booklet',
      description: 'A5 booklet for new employee onboarding. 24 pages. Provide InDesign source and print-ready PDF.',
      status: JobStatus.PAUSED,
      priority: JobPriority.LOW,
      deadline: daysFromNow(45),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
    },
  });

  const job8 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0018`,
      title: 'Google Display Ad Set',
      description: 'Responsive display ads for Google Ads. Required sizes: 300x250, 728x90, 160x600, 320x50.',
      status: JobStatus.ACCEPTED,
      priority: JobPriority.MEDIUM,
      deadline: daysFromNow(10),
      streamId: digitalStream.id,
      clientId: client2.id,
      createdById: admin.id,
    },
  });

  const job9 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0019`,
      title: 'Christmas Campaign Creative',
      description: 'Full Christmas campaign: social posts, email header, website banner. Festive but on-brand.',
      status: JobStatus.ON_HOLD,
      priority: JobPriority.LOW,
      deadline: daysFromNow(90),
      streamId: digitalStream.id,
      clientId: client3.id,
      createdById: admin.id,
      notes: 'On hold until client confirms brand direction for holiday season.',
    },
  });

  const job10 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0020`,
      title: 'Packaging Design — Premium Gift Box',
      description: 'Luxury gift box packaging design. Emboss and foil details required. Structural dieline included.',
      status: JobStatus.REJECTED,
      priority: JobPriority.MEDIUM,
      deadline: daysFromNow(-2),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
      rejectionReason: 'Brief is incomplete. Client needs to provide brand guidelines and target market information before we can proceed.',
    },
  });

  console.log(`✅ Created 10 jobs\n`);

  // ── Assignments ──────────────────────────────────────────────────
  console.log('📋 Creating assignments...');

  const todayAt = (hour: number) => {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  // Job 1 — IN_PROGRESS — assigned to Alex Chen (primary)
  await prisma.jobAssignment.create({
    data: {
      jobId: job1.id,
      designerId: designer1.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: todayAt(9),
      endTime: todayAt(13),
      isActive: true,
    },
  });

  // Job 2 — ASSIGNED — Marcus Lee (primary) + Nina Okafor (secondary)
  await prisma.jobAssignment.create({
    data: {
      jobId: job2.id,
      designerId: designer3.id,
      assignedById: workflowAdmin2.id,
      isPrimary: true,
      startTime: daysFromNow(2),
      endTime: new Date(daysFromNow(2).setHours(17, 0, 0, 0)),
      isActive: true,
    },
  });
  await prisma.jobAssignment.create({
    data: {
      jobId: job2.id,
      designerId: designer4.id,
      assignedById: workflowAdmin2.id,
      isPrimary: false,
      startTime: daysFromNow(3),
      endTime: new Date(daysFromNow(3).setHours(12, 0, 0, 0)),
      isActive: true,
    },
  });

  // Job 3 — AT_RISK — Nina Okafor
  await prisma.jobAssignment.create({
    data: {
      jobId: job3.id,
      designerId: designer4.id,
      assignedById: workflowAdmin2.id,
      isPrimary: true,
      startTime: todayAt(14),
      endTime: todayAt(17),
      isActive: true,
    },
  });

  // Job 7 — PAUSED — Alex Chen
  await prisma.jobAssignment.create({
    data: {
      jobId: job7.id,
      designerId: designer1.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: daysFromNow(10),
      endTime: new Date(daysFromNow(10).setHours(17, 0, 0, 0)),
      isActive: true,
    },
  });

  // Job 6 — COMPLETED — Marcus Lee (now in history)
  await prisma.jobAssignmentHistory.create({
    data: {
      jobId: job6.id,
      designerId: designer3.id,
      assignedById: workflowAdmin2.id,
      isPrimary: true,
      startTime: daysFromNow(-14),
      endTime: daysFromNow(-8),
      unassignedAt: daysFromNow(-8),
      unassignReason: 'Job completed successfully',
    },
  });

  console.log(`✅ Created assignments\n`);

  // ── Status History ───────────────────────────────────────────────
  console.log('📜 Creating status histories...');

  // Job 1 timeline
  await prisma.jobStatusHistory.createMany({
    data: [
      { jobId: job1.id, fromStatus: null, toStatus: JobStatus.SUBMITTED, changedById: client1.id, isSystem: true },
      { jobId: job1.id, fromStatus: JobStatus.SUBMITTED, toStatus: JobStatus.UNDER_REVIEW, changedById: workflowAdmin1.id, isSystem: true },
      { jobId: job1.id, fromStatus: JobStatus.UNDER_REVIEW, toStatus: JobStatus.ACCEPTED, changedById: workflowAdmin1.id },
      { jobId: job1.id, fromStatus: JobStatus.ACCEPTED, toStatus: JobStatus.ASSIGNED, changedById: workflowAdmin1.id },
      { jobId: job1.id, fromStatus: JobStatus.ASSIGNED, toStatus: JobStatus.IN_PROGRESS, changedById: designer1.id },
    ],
  });

  // Job 10 — Rejection
  await prisma.jobStatusHistory.createMany({
    data: [
      { jobId: job10.id, fromStatus: null, toStatus: JobStatus.SUBMITTED, changedById: client1.id, isSystem: true },
      { jobId: job10.id, fromStatus: JobStatus.SUBMITTED, toStatus: JobStatus.UNDER_REVIEW, changedById: workflowAdmin1.id, isSystem: true },
      { jobId: job10.id, fromStatus: JobStatus.UNDER_REVIEW, toStatus: JobStatus.REJECTED, changedById: workflowAdmin1.id, reason: 'Brief incomplete' },
    ],
  });

  console.log(`✅ Created status histories\n`);

  // ── Notifications ────────────────────────────────────────────────
  console.log('🔔 Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: workflowAdmin1.id,
        jobId: job4.id,
        type: 'JOB_SUBMITTED',
        title: 'New Job Request',
        message: `${client1.firstName} ${client1.lastName} submitted a new request: "${job4.title}"`,
        isRead: false,
        metadata: { jobNumber: job4.jobNumber, clientName: `${client1.firstName} ${client1.lastName}` },
      },
      {
        userId: designer4.id,
        jobId: job3.id,
        type: 'JOB_AT_RISK',
        title: '⚠️ Job At Risk — Deadline in 24h',
        message: `"${job3.title}" is due within 24 hours. Priority: CRITICAL.`,
        isRead: false,
        metadata: { jobNumber: job3.jobNumber, deadline: job3.deadline },
      },
      {
        userId: designer1.id,
        jobId: job1.id,
        type: 'JOB_ASSIGNED',
        title: 'New Job Assigned',
        message: `You have been assigned to "${job1.title}" by ${workflowAdmin1.firstName} ${workflowAdmin1.lastName}.`,
        isRead: true,
        readAt: new Date(),
        metadata: { jobNumber: job1.jobNumber },
      },
      {
        userId: client1.id,
        jobId: job10.id,
        type: 'JOB_REJECTED',
        title: 'Job Request Rejected',
        message: `Your request "${job10.title}" was not accepted. Reason: ${job10.rejectionReason}`,
        isRead: false,
        metadata: { jobNumber: job10.jobNumber },
      },
    ],
  });

  console.log(`✅ Created notifications\n`);

  // ── Settings ─────────────────────────────────────────────────────
  console.log('⚙️  Creating settings...');

  const settings = [
    { key: 'work_hours_start', value: '09:00', description: 'Global default work start time (HH:MM)' },
    { key: 'work_hours_end', value: '17:00', description: 'Global default work end time (HH:MM)' },
    { key: 'job_id_prefix', value: 'JB', description: 'Prefix for generated job numbers' },
    { key: 'at_risk_threshold_hours', value: '24', description: 'Hours before deadline to flag job as AT_RISK' },
    { key: 'ai_daily_limit', value: '100', description: 'Max AI queries per user per day (Q24)' },
    { key: 'gemini_model', value: 'gemini-2.0-flash', description: 'Gemini model to use for AI agent' },
    { key: 'max_delegation_hops', value: '3', description: 'Maximum delegation hops per job (Q02)' },
    { key: 'max_designers_per_job', value: '3', description: 'Maximum designers assigned to one job (Q14)' },
    { key: 'max_attachments_per_job', value: '5', description: 'Maximum file attachments per job (Q10)' },
    { key: 'max_attachment_size_mb', value: '50', description: 'Maximum file size in MB per attachment (Q10)' },
    { key: 'smtp_from', value: 'Job Timeline <noreply@jobtimeline.local>', description: 'From address for outgoing emails' },
    { key: 'company_name', value: 'Acme Design Studio', description: 'Company name displayed in emails and UI' },
  ];

  for (const setting of settings) {
    await prisma.setting.create({
      data: {
        ...setting,
        updatedById: admin.id,
      },
    });
  }

  console.log(`✅ Created ${settings.length} settings\n`);

  // ── Summary ──────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('✅ Seed complete! Demo credentials:\n');
  console.log('  ADMIN:           admin@jobtimeline.local     / Admin1234!');
  console.log('  WORKFLOW ADMIN:  wa.brand@jobtimeline.local  / Password1234!');
  console.log('  WORKFLOW ADMIN:  wa.digital@jobtimeline.local/ Password1234!');
  console.log('  DESIGNER:        alex.chen@jobtimeline.local / Password1234!');
  console.log('  CLIENT:          client.acme@jobtimeline.local/ Password1234!');
  console.log('═══════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
