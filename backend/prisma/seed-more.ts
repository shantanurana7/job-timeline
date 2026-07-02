import { PrismaClient, JobStatus, JobPriority } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Adding more dummy jobs for today and tomorrow...');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const wfAdmin = await prisma.user.findFirst({ where: { role: 'WORKFLOW_ADMIN' } });
  const client = await prisma.user.findFirst({ where: { role: 'CLIENT' } });
  const stream = await prisma.stream.findFirst();
  
  const designers = await prisma.user.findMany({ where: { role: 'DESIGNER' }, take: 2 });
  if (!admin || !wfAdmin || !client || !stream || designers.length < 2) {
    console.error('Missing required seed data. Run full seed first.');
    return;
  }

  const now = new Date();
  
  const todayAt = (hour: number, min: number = 0) => {
    const d = new Date();
    d.setHours(hour, min, 0, 0);
    return d;
  };

  const tomorrowAt = (hour: number, min: number = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, min, 0, 0);
    return d;
  };

  const currentYear = now.getFullYear();

  // Create Jobs
  const jobA = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-9001`,
      title: 'Emergency Social Media Post',
      description: 'Quick turnaround social media graphic.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.CRITICAL,
      deadline: todayAt(18),
      streamId: stream.id,
      clientId: client.id,
      createdById: admin.id,
    },
  });

  const jobB = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-9002`,
      title: 'Email Newsletter Revisions',
      description: 'Client requested changes to the footer and header imagery.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.HIGH,
      deadline: todayAt(15),
      streamId: stream.id,
      clientId: client.id,
      createdById: admin.id,
    },
  });

  const jobC = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-9003`,
      title: 'Website Banner Assets',
      description: 'Export 3 different sizes of the hero banner.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.MEDIUM,
      deadline: todayAt(17),
      streamId: stream.id,
      clientId: client.id,
      createdById: admin.id,
    },
  });

  // Create Assignments for Designer 1
  await prisma.jobAssignment.create({
    data: {
      jobId: jobA.id,
      designerId: designers[0].id,
      assignedById: wfAdmin.id,
      isPrimary: true,
      startTime: todayAt(10, 30),
      endTime: todayAt(12, 0),
      isActive: true,
    },
  });

  await prisma.jobAssignment.create({
    data: {
      jobId: jobB.id,
      designerId: designers[0].id,
      assignedById: wfAdmin.id,
      isPrimary: true,
      startTime: todayAt(13, 0),
      endTime: todayAt(15, 30),
      isActive: true,
    },
  });

  // Create Assignment for Designer 2
  await prisma.jobAssignment.create({
    data: {
      jobId: jobC.id,
      designerId: designers[1].id,
      assignedById: wfAdmin.id,
      isPrimary: true,
      startTime: todayAt(9, 0),
      endTime: todayAt(16, 0),
      isActive: true,
    },
  });

  // Create Jobs for tomorrow
  const jobD = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-9004`,
      title: 'Tomorrow Client Presentation',
      description: 'Prepare slides for tomorrow presentation.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.HIGH,
      deadline: tomorrowAt(18),
      streamId: stream.id,
      clientId: client.id,
      createdById: admin.id,
    },
  });

  const jobE = await prisma.job.create({
    data: {
      jobNumber: `JB-${currentYear}-9005`,
      title: 'UI Mockups for New Feature',
      description: 'Create UI mockups for the new feature dashboard.',
      status: JobStatus.ASSIGNED,
      priority: JobPriority.MEDIUM,
      deadline: tomorrowAt(17),
      streamId: stream.id,
      clientId: client.id,
      createdById: admin.id,
    },
  });

  // Create Assignments for Designer 1 (Tomorrow)
  await prisma.jobAssignment.create({
    data: {
      jobId: jobD.id,
      designerId: designers[0].id,
      assignedById: wfAdmin.id,
      isPrimary: true,
      startTime: tomorrowAt(10, 0),
      endTime: tomorrowAt(14, 0),
      isActive: true,
    },
  });

  // Create Assignments for Designer 2 (Tomorrow)
  await prisma.jobAssignment.create({
    data: {
      jobId: jobE.id,
      designerId: designers[1].id,
      assignedById: wfAdmin.id,
      isPrimary: true,
      startTime: tomorrowAt(11, 0),
      endTime: tomorrowAt(16, 0),
      isActive: true,
    },
  });

  console.log(`✅ Added 5 new jobs and assigned them to ${designers[0].firstName} and ${designers[1].firstName} for today and tomorrow.`);
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
