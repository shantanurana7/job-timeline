import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobStatus, Role } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(currentUser: any) {
    const roleFilter = this.buildRoleFilter(currentUser);

    const [
      totalJobs,
      byStatus,
      atRiskCount,
      completedToday,
      recentJobs,
      atRiskJobs,
    ] = await Promise.all([
      this.prisma.job.count({ where: roleFilter }),
      this.prisma.job.groupBy({
        by: ['status'],
        where: roleFilter,
        _count: { _all: true },
      }),
      this.prisma.job.count({ where: { ...roleFilter, isAtRisk: true } }),
      this.prisma.job.count({
        where: {
          ...roleFilter,
          status: JobStatus.COMPLETED,
          completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.job.findMany({
        where: roleFilter,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, jobNumber: true, title: true, status: true,
          priority: true, deadline: true, isAtRisk: true, createdAt: true,
          stream: { select: { id: true, name: true, colorHex: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          assignments: {
            where: { isActive: true },
            include: { designer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
          },
        },
      }),
      this.prisma.job.findMany({
        where: { ...roleFilter, isAtRisk: true },
        orderBy: { deadline: 'asc' },
        take: 5,
        select: {
          id: true, jobNumber: true, title: true, status: true, deadline: true,
          stream: { select: { id: true, name: true, colorHex: true } },
        },
      }),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((b) => [b.status, b._count._all]),
    );

    const completionRate =
      totalJobs > 0 ? Math.round((statusMap['COMPLETED'] ?? 0) / totalJobs * 100) : 0;

    return {
      kpis: {
        totalJobs,
        atRiskCount,
        completedToday,
        completionRate,
        inProgress: statusMap['IN_PROGRESS'] ?? 0,
        submitted: statusMap['SUBMITTED'] ?? 0,
      },
      byStatus: statusMap,
      recentJobs,
      atRiskJobs,
    };
  }

  async getDesignerWorkload() {
    const designers = await this.prisma.user.findMany({
      where: { role: Role.DESIGNER, isActive: true },
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true,
        workHoursStart: true, workHoursEnd: true,
        _count: {
          select: {
            assignments: { where: { isActive: true } },
          },
        },
        assignments: {
          where: {
            isActive: true,
            job: { status: { in: [JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.AT_RISK] } },
          },
          include: {
            job: { select: { id: true, jobNumber: true, title: true, status: true, priority: true, deadline: true, isAtRisk: true } },
          },
        },
        streamMemberships: {
          include: { stream: { select: { id: true, name: true, colorHex: true } } },
        },
      },
    });

    return designers.map((d) => ({
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      avatarUrl: d.avatarUrl,
      activeAssignments: d._count.assignments,
      workHoursStart: d.workHoursStart,
      workHoursEnd: d.workHoursEnd,
      streams: d.streamMemberships.map((m) => m.stream),
      activeJobs: d.assignments.map((a) => a.job),
    }));
  }

  async getStreamThroughput() {
    // Two queries run in parallel:
    //   1. stream metadata (id, name, colorHex) — lightweight
    //   2. job counts grouped by (streamId, status) — PostgreSQL GROUP BY, not JS iteration
    // Old approach loaded every job row into Node.js memory just to count statuses.
    const [streams, jobCounts] = await Promise.all([
      this.prisma.stream.findMany({
        where: { isActive: true },
        select: { id: true, name: true, colorHex: true },
      }),
      this.prisma.job.groupBy({
        by: ['streamId', 'status'],
        where: { streamId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    // Index counts by streamId for O(1) lookup during the final map.
    const countMap = new Map<string, Record<string, number>>();
    for (const row of jobCounts) {
      if (!row.streamId) continue;
      const byStatus = countMap.get(row.streamId) ?? {};
      byStatus[row.status] = row._count._all;
      countMap.set(row.streamId, byStatus);
    }

    return streams.map((s) => {
      const byStatus = countMap.get(s.id) ?? {};
      const totalJobs = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
      return {
        id: s.id,
        name: s.name,
        colorHex: s.colorHex,
        totalJobs,
        byStatus,
        completed: byStatus[JobStatus.COMPLETED] ?? 0,
        atRisk: byStatus[JobStatus.AT_RISK] ?? 0,
      };
    });
  }

  async exportJobsCsv(currentUser: any): Promise<string> {
    const roleFilter = this.buildRoleFilter(currentUser);

    const jobs = await this.prisma.job.findMany({
      where: roleFilter,
      orderBy: { createdAt: 'desc' },
      select: {
        jobNumber: true,
        title: true,
        status: true,
        priority: true,
        billingCode: true,
        isAtRisk: true,
        deadline: true,
        createdAt: true,
        completedAt: true,
        delegationCount: true,
        stream: { select: { name: true } },
        client: { select: { firstName: true, lastName: true } },
        assignments: {
          where: { isActive: true },
          select: { designer: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const rows = jobs.map((j) => ({
      'Job Number': j.jobNumber,
      'Title': j.title,
      'Status': j.status,
      'Priority': j.priority,
      'Stream': j.stream?.name ?? '',
      'Client': `${j.client.firstName} ${j.client.lastName}`,
      'Deadline': j.deadline ? j.deadline.toISOString().slice(0, 10) : '',
      'Created At': j.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      'Completed At': j.completedAt ? j.completedAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      'At Risk': j.isAtRisk ? 'Yes' : 'No',
      'Billing Code': j.billingCode ?? '',
      'Delegation Hops': j.delegationCount,
      'Assigned Designers': j.assignments
        .map((a) => `${a.designer.firstName} ${a.designer.lastName}`)
        .join('; '),
    }));

    return this.toCsv(rows);
  }

  private toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return 'No data available\r\n';

    const headers = Object.keys(rows[0]);
    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return /[,"\n\r]/.test(str) ? `"${str}"` : str;
    };

    const headerRow = headers.map(escape).join(',');
    const dataRows = rows.map((row) => headers.map((h) => escape(row[h])).join(','));
    return [headerRow, ...dataRows].join('\r\n');
  }

  private buildRoleFilter(currentUser: any) {
    if (currentUser.role === Role.CLIENT) return { clientId: currentUser.id };
    if (currentUser.role === Role.DESIGNER) {
      return { assignments: { some: { designerId: currentUser.id, isActive: true } } };
    }
    return {}; // ADMIN + WORKFLOW_ADMIN see all
  }
}
