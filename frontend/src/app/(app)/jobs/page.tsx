'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { jobsApi, streamsApi } from '@/services';
import { Job, JobStatus, JobPriority, Stream } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import Avatar from '@/components/ui/Avatar';
import { formatDate, deadlineCountdown } from '@/lib/utils';
import { Briefcase, Plus, Search, Filter, AlertTriangle, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const STATUSES: JobStatus[] = [
  'SUBMITTED','UNDER_REVIEW','ACCEPTED','ASSIGNED','IN_PROGRESS','PAUSED','AT_RISK','COMPLETED','REJECTED','CANCELLED','ON_HOLD','DELEGATED'
];
const PRIORITIES: JobPriority[] = ['LOW','MEDIUM','HIGH','CRITICAL'];

export default function JobsPage() {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStream, setFilterStream] = useState('');
  const [atRiskOnly, setAtRiskOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (filterStream) params.streamId = filterStream;
      if (search) params.search = search;
      if (atRiskOnly) params.atRiskOnly = true;
      const res = await jobsApi.list(params);
      setJobs(res.data || []);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterStream, search, atRiskOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { streamsApi.list().then((r) => setStreams(r.data || [])); }, []);

  const canCreate = user?.role === 'ADMIN' || user?.role === 'CLIENT';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">{jobs.length} job{jobs.length !== 1 ? 's' : ''} found</p>
        </div>
        {canCreate && (
          <Link href="/jobs/new">
            <button className="btn btn-primary"><Plus size={16} /> New Job</button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input
            id="job-search"
            className="search-input"
            placeholder="Search jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select id="filter-status" className="form-control" style={{ width: 'auto', padding: '0.5rem 0.875rem' }}
          value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>

        <select id="filter-priority" className="form-control" style={{ width: 'auto', padding: '0.5rem 0.875rem' }}
          value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select id="filter-stream" className="form-control" style={{ width: 'auto', padding: '0.5rem 0.875rem' }}
          value={filterStream} onChange={(e) => setFilterStream(e.target.value)}>
          <option value="">All streams</option>
          {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={atRiskOnly} onChange={(e) => setAtRiskOnly(e.target.checked)} />
          <AlertTriangle size={14} color="var(--danger)" /> At risk only
        </label>

        {(filterStatus || filterPriority || filterStream || atRiskOnly) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterStream(''); setAtRiskOnly(false); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <Briefcase size={48} className="empty-state-icon" />
          <h3>No jobs found</h3>
          <p>Try adjusting your filters or create a new job</p>
          {canCreate && <Link href="/jobs/new"><button className="btn btn-primary"><Plus size={16} /> New Job</button></Link>}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th><th>Status</th><th>Priority</th><th>Stream</th><th>Client</th><th>Deadline</th><th>Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const { label, urgent } = deadlineCountdown(job.deadline);
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} legacyBehavior>
                    <tr style={{ cursor: 'pointer' }}>
                      <td style={{ maxWidth: 280 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          {job.isAtRisk && <AlertTriangle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: '0.15rem' }} />}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }} className="truncate">{job.title}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', marginTop: '0.1rem' }}>{job.jobNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td><StatusBadge status={job.status} size="sm" /></td>
                      <td><PriorityBadge priority={job.priority} size="sm" /></td>
                      <td>
                        {job.stream && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: job.stream.colorHex, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{job.stream.name}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                          {job.client?.firstName} {job.client?.lastName}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.875rem', color: urgent ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: urgent ? 600 : 400 }}>
                          {label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex' }} className="avatar-group">
                          {job.assignments?.slice(0, 3).map((a) => (
                            <Avatar key={a.id} firstName={a.designer?.firstName} lastName={a.designer?.lastName}
                              avatarUrl={a.designer?.avatarUrl} size="sm" />
                          ))}
                          {!job.assignments?.length && <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Unassigned</span>}
                        </div>
                      </td>
                    </tr>
                  </Link>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
