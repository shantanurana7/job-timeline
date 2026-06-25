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
    const streams = await this.prisma.stream.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { jobs: true },
        },
        jobs: {
          select: { status: true },
        },
      },
    });

    return streams.map((s) => {
      const statusMap: Record<string, number> = {};
      for (const j of s.jobs) {
        statusMap[j.status] = (statusMap[j.status] ?? 0) + 1;
      }
      return {
        id: s.id,
        name: s.name,
        colorHex: s.colorHex,
        totalJobs: s._count.jobs,
        byStatus: statusMap,
        completed: statusMap['COMPLETED'] ?? 0,
        atRisk: statusMap['AT_RISK'] ?? 0,
      };
    });
  }

  private buildRoleFilter(currentUser: any) {
    if (currentUser.role === Role.CLIENT) return { clientId: currentUser.id };
    if (currentUser.role === Role.DESIGNER) {
      return { assignments: { some: { designerId: currentUser.id, isActive: true } } };
    }
    return {}; // ADMIN + WORKFLOW_ADMIN see all
  }
}
