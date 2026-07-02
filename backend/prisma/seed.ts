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
    data: { year: currentYear, sequence: 22 },
  });

  // ── Jobs ─────────────────────────────────────────────────────────
  console.log('💼 Creating 12 jobs spread across 4 days...');

  const now = new Date();

  // Reference dates (midnight local — used for deadline display)
  const yesterday  = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(0,0,0,0);
  const tomorrow   = new Date(now); tomorrow.setDate(now.getDate() + 1);  tomorrow.setHours(0,0,0,0);
  const monday     = new Date(now); monday.setDate(now.getDate() + 5);    monday.setHours(0,0,0,0);

  // ── YESTERDAY jobs (JB-0011 / JB-0012 / JB-0013) ─────────────────
  // Alex Chen — brand job, completed yesterday
  const job1 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0011`,
      title: 'Annual Report 2024 Cover Design',
      description: 'Premium annual report cover. Corporate blue/gold theme. Must include logo prominently.',
      status: JobStatus.COMPLETED,
      priority: JobPriority.HIGH,
      billingCode: 'ACME2024AR',
      deadline: new Date(yesterday.getTime()),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
      completedAt: new Date(yesterday.getTime()),
    },
  });

  // Priya Sharma — digital, delivered yesterday
  const job2 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0012`,
      title: 'Email Newsletter — July Edition',
      description: 'Monthly newsletter template. Must be mobile-responsive with dark-mode support.',
      status: JobStatus.COMPLETED,
      priority: JobPriority.MEDIUM,
      billingCode: 'GLOBEX-JUL',
      deadline: new Date(yesterday.getTime()),
      streamId: digitalStream.id,
      clientId: client2.id,
      createdById: admin.id,
      completedAt: new Date(yesterday.getTime()),
    },
  });

  // Marcus Lee — brand, paused / carried over from yesterday
  const job3 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0013`,
      title: 'Trade Show Banner Set',
      description: '3x pull-up banners for upcoming trade show. 2000x800mm print-ready files required.',
      status: JobStatus.PAUSED,
      priority: JobPriority.LOW,
      deadline: new Date(tomorrow.getTime()),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
      notes: 'Client requested pause to review copy changes.',
    },
  });

  // ── TODAY jobs (JB-0014 / JB-0015 / JB-0016) ──────────────────────
  // Alex Chen — in progress today
  const job4 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0014`,
      title: 'Brand Logo Refresh',
      description: 'Modernise existing logo. Keep brand recognition but update for digital-first. Deliver SVG, PNG, and updated brand guidelines.',
      status: JobStatus.IN_PROGRESS,
      priority: JobPriority.HIGH,
      deadline: new Date(tomorrow.getTime()),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
    },
  });

  // Nina Okafor — at risk, due today
  const job5 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0015`,
      title: 'Product Launch Email Template',
      description: 'HTML email template for new product launch. Mobile-responsive, dark mode required.',
      status: JobStatus.AT_RISK,
      priority: JobPriority.CRITICAL,
      billingCode: 'INITECH-EM',
      deadline: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0),
      streamId: digitalStream.id,
      clientId: client3.id,
      createdById: admin.id,
      isAtRisk: true,
    },
  });

  // Marcus Lee — assigned, working today
  const job6 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0016`,
      title: 'Google Display Ad Set',
      description: 'Responsive display ads for Google Ads. Required sizes: 300x250, 728x90, 160x600, 320x50.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.MEDIUM,
      deadline: new Date(monday.getTime()),
      streamId: digitalStream.id,
      clientId: client2.id,
      createdById: admin.id,
    },
  });

  // ── TOMORROW jobs (JB-0017 / JB-0018 / JB-0019) ───────────────────
  // Priya Sharma — accepted, starting tomorrow
  const job7 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0017`,
      title: 'Q3 Social Media Campaign Pack',
      description: 'Instagram and LinkedIn post templates for Q3. 10 templates, brand guidelines attached.',
      status: JobStatus.ACCEPTED,
      priority: JobPriority.MEDIUM,
      billingCode: 'GLOBEX-Q3',
      deadline: new Date(monday.getTime()),
      streamId: digitalStream.id,
      clientId: client2.id,
      createdById: admin.id,
    },
  });

  // Alex Chen — under review, scheduled for tomorrow
  const job8 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0018`,
      title: 'Website Hero Section Redesign',
      description: 'Redesign homepage hero. Mobile-first, Figma source files required.',
      status: JobStatus.UNDER_REVIEW,
      priority: JobPriority.HIGH,
      billingCode: 'INITECH-WEB',
      deadline: new Date(monday.getTime()),
      streamId: digitalStream.id,
      clientId: client3.id,
      createdById: admin.id,
    },
  });

  // Nina Okafor — in progress tomorrow
  const job9 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0019`,
      title: 'Packaging Design — Premium Gift Box',
      description: 'Luxury gift box packaging. Emboss/foil details, structural dieline included.',
      status: JobStatus.IN_PROGRESS,
      priority: JobPriority.HIGH,
      deadline: new Date(monday.getTime()),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
    },
  });

  // ── MONDAY jobs (JB-0020 / JB-0021 / JB-0022) ─────────────────────
  // Marcus Lee — upcoming, scheduled Monday
  const job10 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0020`,
      title: 'Employee Onboarding Booklet',
      description: 'A5 booklet for new employee onboarding. 24 pages. Deliver InDesign source + print-ready PDF.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.LOW,
      deadline: new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000),
      streamId: brandStream.id,
      clientId: client1.id,
      createdById: admin.id,
    },
  });

  // Priya Sharma — Monday sprint
  const job11 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0021`,
      title: 'Christmas Campaign Creative',
      description: 'Full Christmas campaign: social posts, email header, website banner. Festive but on-brand.',
      status: JobStatus.ACCEPTED,
      priority: JobPriority.MEDIUM,
      deadline: new Date(monday.getTime() + 14 * 24 * 60 * 60 * 1000),
      streamId: digitalStream.id,
      clientId: client3.id,
      createdById: admin.id,
    },
  });

  // Alex Chen — Monday start
  const job12 = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-0022`,
      title: 'Corporate Presentation Template',
      description: 'PowerPoint + Google Slides master template. 20 slide layouts. Brand compliant.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.MEDIUM,
      deadline: new Date(monday.getTime() + 3 * 24 * 60 * 60 * 1000),
      streamId: brandStream.id,
      clientId: client2.id,
      createdById: admin.id,
    },
  });

  console.log(`✅ Created 12 jobs\n`);

  // ── Assignments ──────────────────────────────────────────────────
  console.log('📋 Creating assignments across 4 days...');

  // Helper: specific date at hour (UTC)
  const dateAt = (base: Date, hour: number, minute = 0) => {
    const d = new Date(base);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };

  // ── YESTERDAY assignments ─────────────────────────────────────────
  // Alex Chen: Annual Report (job1) — yesterday 09:00–13:00 (completed)
  await prisma.jobAssignmentHistory.create({
    data: {
      jobId: job1.id,
      designerId: designer1.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(yesterday, 3, 30),   // 09:00 IST
      endTime:   dateAt(yesterday, 7, 30),   // 13:00 IST
      unassignedAt: dateAt(yesterday, 7, 30),
      unassignReason: 'Job completed',
    },
  });

  // Priya Sharma: Email Newsletter (job2) — yesterday 10:00–15:00 (completed)
  await prisma.jobAssignmentHistory.create({
    data: {
      jobId: job2.id,
      designerId: designer2.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(yesterday, 4, 30),   // 10:00 IST
      endTime:   dateAt(yesterday, 9, 30),   // 15:00 IST
      unassignedAt: dateAt(yesterday, 9, 30),
      unassignReason: 'Job completed',
    },
  });

  // Marcus Lee: Trade Show Banners (job3) — yesterday 09:00–12:00 → paused
  await prisma.jobAssignment.create({
    data: {
      jobId: job3.id,
      designerId: designer3.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(yesterday, 3, 30),   // 09:00 IST
      endTime:   dateAt(yesterday, 6, 30),   // 12:00 IST
      isActive: true,
    },
  });

  // Nina Okafor: Display Ads (job6) — yesterday 08:00–11:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job6.id,
      designerId: designer4.id,
      assignedById: workflowAdmin2.id,
      isPrimary: true,
      startTime: dateAt(yesterday, 2, 30),   // 08:00 IST
      endTime:   dateAt(yesterday, 5, 30),   // 11:00 IST
      isActive: true,
    },
  });

  // ── TODAY assignments ─────────────────────────────────────────────
  // Alex Chen: Brand Logo Refresh (job4) — today 09:00–13:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job4.id,
      designerId: designer1.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(now, 3, 30),   // 09:00 IST
      endTime:   dateAt(now, 7, 30),   // 13:00 IST
      isActive: true,
    },
  });

  // Nina Okafor: Product Launch Email (job5 AT_RISK) — today 08:30–16:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job5.id,
      designerId: designer4.id,
      assignedById: workflowAdmin2.id,
      isPrimary: true,
      startTime: dateAt(now, 3, 0),    // 08:30 IST
      endTime:   dateAt(now, 10, 30),  // 16:00 IST
      isActive: true,
    },
  });

  // Marcus Lee: Display Ad Set (job6) — today 13:00–17:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job6.id,
      designerId: designer3.id,
      assignedById: workflowAdmin2.id,
      isPrimary: false,
      startTime: dateAt(now, 7, 30),   // 13:00 IST
      endTime:   dateAt(now, 11, 30),  // 17:00 IST
      isActive: true,
    },
  });

  // ── TOMORROW assignments ──────────────────────────────────────────
  // Priya Sharma: Q3 Social Media Pack (job7) — tomorrow 10:00–15:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job7.id,
      designerId: designer2.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(tomorrow, 4, 30),   // 10:00 IST
      endTime:   dateAt(tomorrow, 9, 30),   // 15:00 IST
      isActive: true,
    },
  });

  // Alex Chen: Website Hero (job8) — tomorrow 09:00–12:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job8.id,
      designerId: designer1.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(tomorrow, 3, 30),   // 09:00 IST
      endTime:   dateAt(tomorrow, 6, 30),   // 12:00 IST
      isActive: true,
    },
  });

  // Nina Okafor: Gift Box Packaging (job9) — tomorrow 08:00–14:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job9.id,
      designerId: designer4.id,
      assignedById: workflowAdmin2.id,
      isPrimary: true,
      startTime: dateAt(tomorrow, 2, 30),   // 08:00 IST
      endTime:   dateAt(tomorrow, 8, 30),   // 14:00 IST
      isActive: true,
    },
  });

  // ── MONDAY assignments ────────────────────────────────────────────
  // Marcus Lee: Onboarding Booklet (job10) — Monday 09:00–17:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job10.id,
      designerId: designer3.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(monday, 3, 30),   // 09:00 IST
      endTime:   dateAt(monday, 11, 30),  // 17:00 IST
      isActive: true,
    },
  });

  // Priya Sharma: Christmas Campaign (job11) — Monday 10:00–15:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job11.id,
      designerId: designer2.id,
      assignedById: workflowAdmin2.id,
      isPrimary: true,
      startTime: dateAt(monday, 4, 30),   // 10:00 IST
      endTime:   dateAt(monday, 9, 30),   // 15:00 IST
      isActive: true,
    },
  });

  // Alex Chen: Presentation Template (job12) — Monday 09:00–13:00
  await prisma.jobAssignment.create({
    data: {
      jobId: job12.id,
      designerId: designer1.id,
      assignedById: workflowAdmin1.id,
      isPrimary: true,
      startTime: dateAt(monday, 3, 30),   // 09:00 IST
      endTime:   dateAt(monday, 7, 30),   // 13:00 IST
      isActive: true,
    },
  });

  console.log(`✅ Created assignments across 4 days\n`);

  // ── Status History ───────────────────────────────────────────────
  console.log('📜 Creating status histories...');

  await prisma.jobStatusHistory.createMany({
    data: [
      // job4 — Logo Refresh — full journey to IN_PROGRESS
      { jobId: job4.id, fromStatus: null,                toStatus: JobStatus.SUBMITTED,    changedById: client1.id,       isSystem: true },
      { jobId: job4.id, fromStatus: JobStatus.SUBMITTED, toStatus: JobStatus.UNDER_REVIEW, changedById: workflowAdmin1.id, isSystem: true },
      { jobId: job4.id, fromStatus: JobStatus.UNDER_REVIEW, toStatus: JobStatus.ACCEPTED,  changedById: workflowAdmin1.id },
      { jobId: job4.id, fromStatus: JobStatus.ACCEPTED,  toStatus: JobStatus.ASSIGNED,     changedById: workflowAdmin1.id },
      { jobId: job4.id, fromStatus: JobStatus.ASSIGNED,  toStatus: JobStatus.IN_PROGRESS,  changedById: designer1.id },
      // job5 — Product Email — escalated to AT_RISK
      { jobId: job5.id, fromStatus: null,                toStatus: JobStatus.SUBMITTED,    changedById: client3.id,       isSystem: true },
      { jobId: job5.id, fromStatus: JobStatus.SUBMITTED, toStatus: JobStatus.UNDER_REVIEW, changedById: workflowAdmin2.id, isSystem: true },
      { jobId: job5.id, fromStatus: JobStatus.UNDER_REVIEW, toStatus: JobStatus.ACCEPTED,  changedById: workflowAdmin2.id },
      { jobId: job5.id, fromStatus: JobStatus.ACCEPTED,  toStatus: JobStatus.ASSIGNED,     changedById: workflowAdmin2.id },
      { jobId: job5.id, fromStatus: JobStatus.ASSIGNED,  toStatus: JobStatus.AT_RISK,      changedById: workflowAdmin2.id, isSystem: true, reason: 'Deadline within 24h' },
    ],
  });

  console.log(`✅ Created status histories\n`);

  // ── Notifications ────────────────────────────────────────────────
  console.log('🔔 Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: workflowAdmin1.id,
        jobId: job8.id,
        type: 'JOB_SUBMITTED',
        title: 'New Job Request',
        message: `${client3.firstName} ${client3.lastName} submitted a new request: "${job8.title}"`,
        isRead: false,
        metadata: { jobNumber: job8.jobNumber, clientName: `${client3.firstName} ${client3.lastName}` },
      },
      {
        userId: designer4.id,
        jobId: job5.id,
        type: 'JOB_AT_RISK',
        title: '⚠️ Job At Risk — Deadline Today',
        message: `"${job5.title}" is due today. Priority: CRITICAL.`,
        isRead: false,
        metadata: { jobNumber: job5.jobNumber, deadline: job5.deadline },
      },
      {
        userId: designer1.id,
        jobId: job4.id,
        type: 'JOB_ASSIGNED',
        title: 'New Job Assigned',
        message: `You have been assigned to "${job4.title}" by ${workflowAdmin1.firstName} ${workflowAdmin1.lastName}.`,
        isRead: true,
        readAt: new Date(),
        metadata: { jobNumber: job4.jobNumber },
      },
      {
        userId: designer3.id,
        jobId: job10.id,
        type: 'JOB_ASSIGNED',
        title: 'New Job Assigned',
        message: `You have been assigned to "${job10.title}" for Monday.`,
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
  console.log('  ADMIN:           admin@jobtimeline.local       / Admin1234!');
  console.log('  WORKFLOW ADMIN:  wa.brand@jobtimeline.local    / Password1234!');
  console.log('  WORKFLOW ADMIN:  wa.digital@jobtimeline.local  / Password1234!');
  console.log('  DESIGNER:        alex.chen@jobtimeline.local   / Password1234!');
  console.log('  CLIENT:          client.acme@jobtimeline.local / Password1234!');
  console.log('');
  console.log('  12 jobs spread: Yesterday · Today · Tomorrow · Monday');
  console.log('  Designers: Alex Chen · Priya Sharma · Marcus Lee · Nina Okafor');
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
