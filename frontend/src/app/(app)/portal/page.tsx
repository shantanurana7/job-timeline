'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { jobsApi } from '@/services';
import { Job, JobStatus } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { formatDate, deadlineCountdown } from '@/lib/utils';
import { FileText, Plus, CheckCircle, Clock, ExternalLink } from 'lucide-react';

const ACTIVE_STATUSES: JobStatus[] = [
  'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'ASSIGNED', 'IN_PROGRESS', 'AT_RISK',
];

export default function ClientPortalPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    jobsApi.list()
      .then((r) => setJobs(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED');

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Client Portal</h1>
          <p className="page-subtitle">Track your job requests and view deliverables</p>
        </div>
        <Link href="/jobs/new">
          <button className="btn btn-primary">
            <Plus size={16} /> Submit New Request
          </button>
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          {/* Active Jobs */}
          <section style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
              <Clock size={18} color="var(--accent)" />
              <h2 style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Active Requests</h2>
              <span style={{
                fontSize: '0.75rem', fontWeight: 600,
                background: 'var(--accent-soft)', color: 'var(--accent)',
                padding: '0.125rem 0.5rem', borderRadius: '999px',
              }}>
                {activeJobs.length}
              </span>
            </div>

            {activeJobs.length === 0 ? (
              <div className="empty-state">
                <FileText size={40} className="empty-state-icon" />
                <h3>No active requests</h3>
                <p>Submit a new request to get started</p>
                <Link href="/jobs/new">
                  <button className="btn btn-primary"><Plus size={16} /> Submit New Request</button>
                </Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Submitted</th>
                      <th>Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeJobs.map((job) => {
                      const { label, urgent } = deadlineCountdown(job.deadline);
                      return (
                        <Link key={job.id} href={`/jobs/${job.id}`} legacyBehavior>
                          <tr style={{ cursor: 'pointer' }}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{job.title}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', marginTop: '0.1rem' }}>{job.jobNumber}</div>
                            </td>
                            <td><StatusBadge status={job.status} size="sm" /></td>
                            <td><PriorityBadge priority={job.priority} size="sm" /></td>
                            <td>
                              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                {formatDate(job.createdAt)}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                fontSize: '0.875rem',
                                color: urgent ? 'var(--danger)' : 'var(--text-secondary)',
                                fontWeight: urgent ? 600 : 400,
                              }}>
                                {label}
                              </span>
                            </td>
                          </tr>
                        </Link>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Completed Jobs */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
              <CheckCircle size={18} color="var(--success)" />
              <h2 style={{ fontWeight: 700, fontSize: '1.0625rem' }}>Completed</h2>
              <span style={{
                fontSize: '0.75rem', fontWeight: 600,
                background: 'var(--success-soft)', color: 'var(--success)',
                padding: '0.125rem 0.5rem', borderRadius: '999px',
              }}>
                {completedJobs.length}
              </span>
            </div>

            {completedJobs.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Completed jobs will appear here
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Priority</th>
                      <th>Submitted</th>
                      <th>Completed</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedJobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{job.title}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', marginTop: '0.1rem' }}>{job.jobNumber}</div>
                        </td>
                        <td><PriorityBadge priority={job.priority} size="sm" /></td>
                        <td>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            {formatDate(job.createdAt)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.875rem', color: 'var(--success)' }}>
                            {job.completedAt ? formatDate(job.completedAt) : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href={`/jobs/${job.id}`}>
                            <button className="btn btn-ghost btn-sm">
                              View <ExternalLink size={13} />
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
