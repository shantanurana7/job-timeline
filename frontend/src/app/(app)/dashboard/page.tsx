'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { jobsApi } from '@/services';
import { Job, JobStatus } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import Avatar from '@/components/ui/Avatar';
import { formatDate, deadlineCountdown } from '@/lib/utils';
import {
  Briefcase, AlertTriangle, CheckCircle, Clock,
  TrendingUp, ArrowRight, Loader2,
} from 'lucide-react';
import Link from 'next/link';

interface KPI {
  label: string; value: number | string; icon: React.ReactNode;
  color: string; bgColor: string;
}

function KpiCard({ label, value, icon, color, bgColor }: KPI) {
  return (
    <div className="kpi-card" style={{ borderTop: `2px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="kpi-value" style={{ color }}>{value}</div>
          <div className="kpi-label">{label}</div>
        </div>
        <div style={{ padding: '0.625rem', background: bgColor, borderRadius: 'var(--radius)', color }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const { label, urgent } = deadlineCountdown(job.deadline);
  return (
    <Link href={`/jobs/${job.id}`}>
      <tr>
        <td>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{job.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.1rem' }}>{job.jobNumber}</div>
          </div>
        </td>
        <td><StatusBadge status={job.status} size="sm" /></td>
        <td><PriorityBadge priority={job.priority} size="sm" /></td>
        <td>
          {job.stream && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: job.stream.colorHex, flexShrink: 0 }} />
              <span style={{ fontSize: '0.875rem' }}>{job.stream.name}</span>
            </span>
          )}
        </td>
        <td>
          <span style={{ fontSize: '0.875rem', color: urgent ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {label}
          </span>
        </td>
        <td>
          <div style={{ display: 'flex' }}>
            {job.assignments?.slice(0, 3).map((a) => (
              <Avatar key={a.id} firstName={a.designer?.firstName} lastName={a.designer?.lastName} size="sm"
                avatarUrl={a.designer?.avatarUrl} />
            ))}
          </div>
        </td>
      </tr>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    jobsApi.list().then((r) => { setJobs(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const byStatus = (status: JobStatus) => jobs.filter((j) => j.status === status).length;
  const atRisk = jobs.filter((j) => j.isAtRisk).length;
  const inProgress = jobs.filter((j) => j.status === 'IN_PROGRESS').length;
  const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
  const total = jobs.length;

  const recentJobs = [...jobs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8);
  const atRiskJobs = jobs.filter((j) => j.isAtRisk).slice(0, 5);

  const kpis: KPI[] = [
    { label: 'Total Jobs', value: total, icon: <Briefcase size={20} />, color: 'var(--accent)', bgColor: 'var(--accent-soft)' },
    { label: 'In Progress', value: inProgress, icon: <TrendingUp size={20} />, color: 'var(--info)', bgColor: 'var(--info-soft)' },
    { label: 'At Risk', value: atRisk, icon: <AlertTriangle size={20} />, color: 'var(--danger)', bgColor: 'var(--danger-soft)' },
    { label: 'Completed', value: completed, icon: <CheckCircle size={20} />, color: 'var(--success)', bgColor: 'var(--success-soft)' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Good {greeting()}, {user?.firstName} 👋</h1>
          <p className="page-subtitle">Here's what's happening with your jobs today</p>
        </div>
        <Link href="/jobs/new">
          <button className="btn btn-primary">
            <Briefcase size={16} /> New Job
          </button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Recent Jobs Table */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <h3 style={{ fontWeight: 700 }}>Recent Jobs</h3>
            <Link href="/jobs">
              <button className="btn btn-ghost btn-sm">View all <ArrowRight size={14} /></button>
            </Link>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <div className="spinner" />
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th><th>Status</th><th>Priority</th><th>Stream</th><th>Deadline</th><th>Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => <JobRow key={job.id} job={job} />)}
                  {recentJobs.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No jobs yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* At Risk Panel */}
        <div>
          <div style={{ marginBottom: '0.875rem' }}>
            <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} color="var(--danger)" />
              At Risk
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {atRiskJobs.length === 0 ? (
              <div className="card card-body" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <CheckCircle size={24} color="var(--success)" style={{ margin: '0 auto 0.5rem' }} />
                No at-risk jobs. Great work!
              </div>
            ) : atRiskJobs.map((job) => {
              const { label } = deadlineCountdown(job.deadline);
              return (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <div className="card card-body at-risk-pulse" style={{ cursor: 'pointer', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.375rem' }}>{job.title}</div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={job.status} size="sm" />
                      <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>{job.jobNumber}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Quick Status Summary */}
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-body" style={{ padding: '1rem' }}>
              <h4 style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Status Breakdown
              </h4>
              {(['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'AT_RISK', 'COMPLETED'] as JobStatus[]).map((s) => {
                const count = byStatus(s);
                const pct = total ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={s} style={{ marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <StatusBadge status={s} size="sm" />
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{count}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: `var(--status-${s.toLowerCase().replace('_', '-')})`,
                        borderRadius: 2,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
