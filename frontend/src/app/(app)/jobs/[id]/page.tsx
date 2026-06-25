'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { jobsApi } from '@/services';
import { Job, JobStatus } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import Avatar from '@/components/ui/Avatar';
import { formatDate, formatRelativeTime, getStatusLabel } from '@/lib/utils';
import { toast } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  ArrowLeft, Clock, Calendar, User, Building2,
  AlertTriangle, ChevronRight, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['ASSIGNED', 'DELEGATED', 'CANCELLED'],
  REJECTED: ['SUBMITTED'],
  DELEGATED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'PAUSED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'PAUSED', 'AT_RISK', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  AT_RISK: ['COMPLETED', 'PAUSED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const [job, setJob] = useState<Job | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStatus, setChangingStatus] = useState(false);
  const [uploading, setUploading] = useState(false);

  const id = params.id as string;

  const loadData = async () => {
    try {
      const [jobRes, attRes] = await Promise.all([
        jobsApi.get(id),
        import('@/services').then(({ attachmentsApi }) => attachmentsApi.list(id)),
      ]);
      setJob(jobRes.data);
      setAttachments(attRes.data || []);
    } catch {
      toast.error('Job not found');
      router.push('/jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id]);

  const handleStatusChange = async (newStatus: JobStatus) => {
    if (!job) return;
    setChangingStatus(true);
    try {
      await jobsApi.changeStatus(job.id, newStatus);
      toast.success(`Status changed to ${getStatusLabel(newStatus)}`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to change status');
    } finally {
      setChangingStatus(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !job) return;
    
    setUploading(true);
    try {
      const { attachmentsApi } = await import('@/services');
      await attachmentsApi.upload(job.id, file);
      toast.success('File uploaded successfully');
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = ''; // reset input
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      const { attachmentsApi } = await import('@/services');
      await attachmentsApi.delete(attachmentId);
      toast.success('File deleted');
      await loadData();
    } catch (err: any) {
      toast.error('Failed to delete file');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!job) return null;

  const allowedTransitions = TRANSITIONS[job.status] || [];
  const canChangeStatus = user?.role === 'ADMIN' || user?.role === 'WORKFLOW_ADMIN';

  return (
    <div>
      {/* Back nav */}
      <Link href="/jobs">
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={16} /> Back to Jobs
        </button>
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-sm)' }}>
              {job.jobNumber}
            </span>
            <StatusBadge status={job.status} />
            <PriorityBadge priority={job.priority} />
            {job.isAtRisk && (
              <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                <AlertTriangle size={12} /> AT RISK
              </span>
            )}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.25 }}>{job.title}</h1>
        </div>

        {/* Status actions */}
        {canChangeStatus && allowedTransitions.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {allowedTransitions.map((s) => (
              <button
                key={s}
                className="btn btn-secondary btn-sm"
                onClick={() => handleStatusChange(s)}
                disabled={changingStatus}
              >
                {changingStatus ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : <RefreshCw size={13} />}
                {getStatusLabel(s)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Description */}
          <div className="card card-body">
            <h3 style={{ marginBottom: '0.75rem', fontWeight: 700 }}>Description</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{job.description}</p>
            {job.notes && (
              <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--accent)' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.375rem' }}>Notes</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{job.notes}</p>
              </div>
            )}
          </div>

          {/* Assignments */}
          <div className="card card-body">
            <h3 style={{ marginBottom: '0.875rem', fontWeight: 700 }}>Assigned Designers</h3>
            {!job.assignments?.length ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No designers assigned yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {job.assignments.map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                    <Avatar firstName={a.designer?.firstName} lastName={a.designer?.lastName} avatarUrl={a.designer?.avatarUrl} size="md" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.designer?.firstName} {a.designer?.lastName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {formatDate(a.startTime)} → {formatDate(a.endTime)}
                      </div>
                    </div>
                    {a.isPrimary && (
                      <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '0.7rem' }}>Primary</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="card card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <h3 style={{ fontWeight: 700 }}>Attachments</h3>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                {uploading ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : null}
                Upload File
                <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>

            {!attachments?.length ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No attachments yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {attachments.map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.fileName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {(parseInt(a.sizeBytes, 10) / 1024 / 1024).toFixed(2)} MB • Uploaded by {a.uploadedBy?.firstName} {a.uploadedBy?.lastName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <a href={a.fileKey.startsWith('http') ? a.fileKey : `http://localhost:3001${a.fileKey}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        View
                      </a>
                      {/* Delete logic. Only Admin/WA or owner can delete */}
                      {(user?.role === 'ADMIN' || user?.role === 'WORKFLOW_ADMIN' || user?.id === a.uploadedById) && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteAttachment(a.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status History */}
          <div className="card card-body">
            <h3 style={{ marginBottom: '0.875rem', fontWeight: 700 }}>Status History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {(job as any).statusHistory?.map((entry: any, i: number) => (
                <div key={entry.id} style={{ display: 'flex', gap: '0.875rem', paddingBottom: '0.875rem', position: 'relative' }}>
                  {i < ((job as any).statusHistory?.length - 1) && (
                    <div style={{ position: 'absolute', left: '7px', top: '16px', bottom: 0, width: 1, background: 'var(--border)' }} />
                  )}
                  <div style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: '0.25rem', zIndex: 1 }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      {entry.fromStatus && (
                        <><StatusBadge status={entry.fromStatus} size="sm" /> <ChevronRight size={12} color="var(--text-muted)" /></>
                      )}
                      <StatusBadge status={entry.toStatus} size="sm" />
                    </div>
                    {entry.reason && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{entry.reason}</p>}
                    <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {formatRelativeTime(entry.changedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <h4 style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Details</h4>

            <InfoRow icon={<Calendar size={15} />} label="Deadline" value={job.deadline ? formatDate(job.deadline) : '—'} />
            <InfoRow icon={<Clock size={15} />} label="Created" value={formatDate(job.createdAt)} />
            <InfoRow icon={<User size={15} />} label="Client" value={`${job.client?.firstName ?? ''} ${job.client?.lastName ?? ''}`} />
            {job.stream && (
              <InfoRow
                icon={<span style={{ width: 12, height: 12, borderRadius: '50%', background: job.stream.colorHex }} />}
                label="Stream"
                value={job.stream.name}
              />
            )}
            {job.billingCode && <InfoRow icon={<Building2 size={15} />} label="Billing Code" value={job.billingCode} />}
            <InfoRow icon={<RefreshCw size={15} />} label="Delegation Hops" value={`${job.delegationCount} / 3`} />
          </div>

          {job.rejectionReason && (
            <div className="card card-body" style={{ border: '1px solid rgba(239,68,68,0.25)' }}>
              <h4 style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>Rejection Reason</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{job.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '0.1rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.1rem' }}>{label}</div>
        <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  );
}
