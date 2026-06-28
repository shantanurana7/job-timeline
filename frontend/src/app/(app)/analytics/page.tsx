'use client';
import { useEffect, useState } from 'react';
import { analyticsApi } from '@/services';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import { BarChart2, Download, Users, Layers, CheckCircle } from 'lucide-react';

interface StreamStat {
  id: string;
  name: string;
  colorHex: string;
  totalJobs: number;
  completed: number;
  atRisk: number;
  byStatus: Record<string, number>;
}

interface DesignerWorkload {
  id: string;
  firstName: string;
  lastName: string;
  activeAssignments: number;
  streams: { id: string; name: string; colorHex: string }[];
  activeJobs: { id: string; jobNumber: string; title: string; status: string }[];
}

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [streams, setStreams] = useState<StreamStat[]>([]);
  const [workload, setWorkload] = useState<DesignerWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([analyticsApi.streams(), analyticsApi.workload()])
      .then(([s, w]) => {
        setStreams(s.data ?? []);
        setWorkload(w.data ?? []);
      })
      .catch(() => toast.error('Failed to load analytics data'))
      .finally(() => setLoading(false));
  }, []);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const response = await analyticsApi.exportJobs('csv');
      const blob = new Blob([response.data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `jobs-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Export downloaded successfully');
    } catch {
      toast.error('Export failed — please try again');
    } finally {
      setExporting(false);
    }
  };

  const canExport = user?.role === 'ADMIN' || user?.role === 'WORKFLOW_ADMIN';

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={24} color="var(--accent)" />
            Analytics
          </h1>
          <p className="page-subtitle">Stream throughput and designer workload insights</p>
        </div>
        {canExport && (
          <button
            className="btn btn-primary"
            onClick={handleExportCsv}
            disabled={exporting || loading}
          >
            {exporting
              ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              : <Download size={16} />}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Stream Throughput */}
          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={17} color="var(--accent)" />
              Stream Throughput
            </h2>

            {streams.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Layers size={32} /></div>
                <p>No streams found</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Stream</th>
                      <th>Total</th>
                      <th>Completed</th>
                      <th>In Progress</th>
                      <th>At Risk</th>
                      <th>Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streams.map((s) => {
                      const rate = s.totalJobs > 0 ? Math.round((s.completed / s.totalJobs) * 100) : 0;
                      return (
                        <tr key={s.id}>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.colorHex, flexShrink: 0 }} />
                              <span style={{ fontWeight: 500 }}>{s.name}</span>
                            </span>
                          </td>
                          <td>{s.totalJobs}</td>
                          <td>
                            <span style={{ color: s.completed > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                              {s.completed}
                            </span>
                          </td>
                          <td>{s.byStatus?.['IN_PROGRESS'] ?? 0}</td>
                          <td>
                            <span style={{ color: s.atRisk > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                              {s.atRisk}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
                                <div style={{
                                  height: '100%',
                                  width: `${rate}%`,
                                  background: 'var(--success)',
                                  borderRadius: 3,
                                  transition: 'width 0.5s ease',
                                }} />
                              </div>
                              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', flexShrink: 0, minWidth: '2.5rem', textAlign: 'right' }}>
                                {rate}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Designer Workload */}
          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={17} color="var(--accent)" />
              Designer Workload
            </h2>

            {workload.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Users size={32} /></div>
                <p>No active designers</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {workload.map((d) => {
                  const isOverloaded = d.activeAssignments >= 3;
                  return (
                    <div key={d.id} className="card card-body">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                            {d.firstName} {d.lastName}
                          </div>
                          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                            {d.streams.length > 0
                              ? d.streams.map((s) => s.name).join(', ')
                              : 'No stream assigned'}
                          </div>
                        </div>
                        <span style={{
                          background: isOverloaded ? 'var(--danger-soft)' : 'var(--accent-soft)',
                          color: isOverloaded ? 'var(--danger)' : 'var(--accent)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.2rem 0.625rem',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}>
                          {d.activeAssignments} active
                        </span>
                      </div>

                      {d.activeJobs.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          {d.activeJobs.slice(0, 3).map((j) => (
                            <div key={j.id} style={{
                              fontSize: '0.8125rem',
                              padding: '0.25rem 0.5rem',
                              background: 'var(--bg-elevated)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-secondary)',
                            }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.375rem' }}>
                                {j.jobNumber}
                              </span>
                              {j.title}
                            </div>
                          ))}
                          {d.activeJobs.length > 3 && (
                            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', paddingLeft: '0.5rem', paddingTop: '0.125rem' }}>
                              +{d.activeJobs.length - 3} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                          <CheckCircle size={13} color="var(--success)" />
                          No active jobs
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
}
