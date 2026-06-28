'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { jobsApi, usersApi, streamsApi, assignmentsApi, attachmentsApi } from '@/services';
import { Job, JobStatus } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import Avatar from '@/components/ui/Avatar';
import { formatDate, formatRelativeTime, getStatusLabel } from '@/lib/utils';
import { toast } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  ArrowLeft, Clock, Calendar, User, Building2,
  AlertTriangle, ChevronRight, Play, Pause, CheckCircle2,
  PauseCircle, X, UserPlus, GitBranch, Loader2, Pencil,
} from 'lucide-react';
import Link from 'next/link';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const [job, setJob] = useState<Job | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modal visibility
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [showEditAssignModal, setShowEditAssignModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [editAssignDesignerId, setEditAssignDesignerId] = useState('');
  const [editAssignStart, setEditAssignStart] = useState('');
  const [editAssignEnd, setEditAssignEnd] = useState('');

  // Accept & Assign modal
  const [assignDesignerId, setAssignDesignerId] = useState('');
  const [assignStart, setAssignStart] = useState('');
  const [assignEnd, setAssignEnd] = useState('');
  const [designersList, setDesignersList] = useState<any[]>([]);
  const [loadingDesigners, setLoadingDesigners] = useState(false);

  // Reject modal
  const [rejectReason, setRejectReason] = useState('');

  // Delegate modal
  const [delegateStreamId, setDelegateStreamId] = useState('');
  const [delegateReason, setDelegateReason] = useState('');
  const [streamsList, setStreamsList] = useState<any[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);

  const id = params.id as string;

  const loadData = async () => {
    try {
      const [jobRes, attRes] = await Promise.all([
        jobsApi.get(id),
        attachmentsApi.list(id),
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

  // Load designers when assign or edit-assign modal opens
  useEffect(() => {
    if (!showAssignModal && !showEditAssignModal) return;
    setLoadingDesigners(true);
    usersApi.list({ role: 'DESIGNER', isActive: true })
      .then((res) => setDesignersList(res.data || []))
      .catch(() => toast.error('Failed to load designers'))
      .finally(() => setLoadingDesigners(false));
  }, [showAssignModal, showEditAssignModal]);

  // Load streams when delegate modal opens
  useEffect(() => {
    if (!showDelegateModal) return;
    setLoadingStreams(true);
    streamsApi.list()
      .then((res) => setStreamsList(res.data || []))
      .catch(() => toast.error('Failed to load streams'))
      .finally(() => setLoadingStreams(false));
  }, [showDelegateModal]);

  const handleStatusChange = async (newStatus: JobStatus, reason?: string) => {
    if (!job) return;
    setActionLoading(true);
    try {
      await jobsApi.changeStatus(job.id, newStatus, reason);
      toast.success(`Status changed to ${getStatusLabel(newStatus)}`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to change status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSubmit = async () => {
    if (!job || !assignDesignerId || !assignStart || !assignEnd) {
      toast.error('Please fill in all fields');
      return;
    }
    setActionLoading(true);
    try {
      await assignmentsApi.assign({
        jobId: job.id,
        designerId: assignDesignerId,
        startTime: new Date(assignStart).toISOString(),
        endTime: new Date(assignEnd).toISOString(),
        isPrimary: true,
      });
      toast.success('Job accepted and designer assigned');
      setShowAssignModal(false);
      setAssignDesignerId('');
      setAssignStart('');
      setAssignEnd('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to assign designer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!job) return;
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setActionLoading(true);
    try {
      await jobsApi.changeStatus(job.id, 'REJECTED' as JobStatus, rejectReason.trim());
      toast.success('Job rejected');
      setShowRejectModal(false);
      setRejectReason('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reject job');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelegateSubmit = async () => {
    if (!job || !delegateStreamId) {
      toast.error('Please select a stream');
      return;
    }
    setActionLoading(true);
    try {
      await jobsApi.delegate(job.id, delegateStreamId, delegateReason.trim() || undefined);
      toast.success('Job delegated to new stream');
      setShowDelegateModal(false);
      setDelegateStreamId('');
      setDelegateReason('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delegate job');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditAssignment = (a: any) => {
    setEditingAssignment(a);
    setEditAssignDesignerId(a.designer?.id || '');
    setEditAssignStart(format(new Date(a.startTime), "yyyy-MM-dd'T'HH:mm"));
    setEditAssignEnd(format(new Date(a.endTime), "yyyy-MM-dd'T'HH:mm"));
    setShowEditAssignModal(true);
  };

  const handleEditAssignSubmit = async () => {
    if (!editingAssignment || !editAssignDesignerId || !editAssignStart || !editAssignEnd) {
      toast.error('Please fill in all fields');
      return;
    }
    setActionLoading(true);
    try {
      await assignmentsApi.reschedule(editingAssignment.id, {
        designerId: editAssignDesignerId,
        startTime: new Date(editAssignStart).toISOString(),
        endTime: new Date(editAssignEnd).toISOString(),
      });
      toast.success('Assignment updated');
      setShowEditAssignModal(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update assignment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !job) return;
    setUploading(true);
    try {
      await attachmentsApi.upload(job.id, file);
      toast.success('File uploaded successfully');
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await attachmentsApi.delete(attachmentId);
      toast.success('File deleted');
      await loadData();
    } catch {
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

  // ── Permission flags ───────────────────────────────────────────────────────
  const isAdmin      = user?.role === 'ADMIN';
  const isWfAdmin    = user?.role === 'WORKFLOW_ADMIN';
  const isDesigner   = user?.role === 'DESIGNER';
  const isClient     = user?.role === 'CLIENT';

  const canTriage    = isAdmin || isWfAdmin;
  const isAssigned   = isDesigner &&
    (job as any).assignments?.some((a: any) => a.designer?.id === user?.id);
  const canHold      = isAdmin || isWfAdmin || isAssigned;
  const canCancel    = isAdmin || (isClient && (job as any).client?.id === user?.id);

  const activeWork   = ['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'AT_RISK'].includes(job.status);
  const canPlay      = isAssigned && ['ASSIGNED', 'PAUSED', 'AT_RISK'].includes(job.status);
  const canPause     = isAssigned && ['IN_PROGRESS', 'AT_RISK'].includes(job.status);
  const canComplete  = isAssigned && ['IN_PROGRESS', 'PAUSED', 'AT_RISK'].includes(job.status);
  const canReleaseHold = canHold && job.status === 'ON_HOLD';

  const hasAnyAction =
    (canTriage && job.status === 'UNDER_REVIEW') ||
    canPlay || canPause || canComplete ||
    (canHold && activeWork) ||
    canReleaseHold ||
    (canCancel && !['COMPLETED', 'CANCELLED'].includes(job.status));

  return (
    <div>
      {/* Back nav */}
      <Link href="/jobs">
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={16} /> Back to Jobs
        </button>
      </Link>

      {/* Page header */}
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.25 }}>
            {job.title}
          </h1>
        </div>
      </div>

      {/* ── Role-specific action panel ─────────────────────────────────────── */}
      {hasAnyAction && (
        <div className="card card-body" style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          {/* WF Admin / Admin: triage controls on UNDER_REVIEW */}
          {canTriage && job.status === 'UNDER_REVIEW' && (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowAssignModal(true)}
                disabled={actionLoading}
                style={{ gap: '0.375rem' }}
              >
                <UserPlus size={14} /> Accept &amp; Assign
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDelegateModal(true)}
                disabled={actionLoading}
                style={{ gap: '0.375rem' }}
              >
                <GitBranch size={14} /> Delegate
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setShowRejectModal(true)}
                disabled={actionLoading}
                style={{ gap: '0.375rem' }}
              >
                <X size={14} /> Reject
              </button>
            </>
          )}

          {/* Designer: Play (start / resume) */}
          {canPlay && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleStatusChange('IN_PROGRESS' as JobStatus)}
              disabled={actionLoading}
              style={{ gap: '0.375rem' }}
            >
              {actionLoading ? <Loader2 size={13} className="spinner" /> : <Play size={13} />}
              {job.status === 'ASSIGNED' ? 'Start Work' : 'Resume'}
            </button>
          )}

          {/* Designer: Pause */}
          {canPause && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleStatusChange('PAUSED' as JobStatus)}
              disabled={actionLoading}
              style={{ gap: '0.375rem' }}
            >
              {actionLoading ? <Loader2 size={13} className="spinner" /> : <Pause size={13} />}
              Pause
            </button>
          )}

          {/* Designer: Mark Complete */}
          {canComplete && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleStatusChange('COMPLETED' as JobStatus)}
              disabled={actionLoading}
              style={{ gap: '0.375rem', borderColor: 'var(--success)', color: 'var(--success)' }}
            >
              {actionLoading ? <Loader2 size={13} className="spinner" /> : <CheckCircle2 size={13} />}
              Mark Complete
            </button>
          )}

          {/* On Hold button (WF Admin, Admin, assigned Designer) */}
          {canHold && activeWork && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleStatusChange('ON_HOLD' as JobStatus)}
              disabled={actionLoading}
              style={{ gap: '0.375rem', color: 'var(--warning)' }}
            >
              <PauseCircle size={13} /> Put On Hold
            </button>
          )}

          {/* Release Hold */}
          {canReleaseHold && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleStatusChange('IN_PROGRESS' as JobStatus)}
              disabled={actionLoading}
              style={{ gap: '0.375rem' }}
            >
              {actionLoading ? <Loader2 size={13} className="spinner" /> : <Play size={13} />}
              Release Hold
            </button>
          )}

          {/* Cancel (Admin or own Client) */}
          {canCancel && !['COMPLETED', 'CANCELLED'].includes(job.status) && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (confirm('Are you sure you want to cancel this job? This cannot be undone.')) {
                  handleStatusChange('CANCELLED' as JobStatus);
                }
              }}
              disabled={actionLoading}
              style={{ gap: '0.375rem', marginLeft: 'auto' }}
            >
              <X size={13} /> Cancel Job
            </button>
          )}
        </div>
      )}

      {/* ── Two-column layout ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Description */}
          <div className="card card-body">
            <h3 style={{ marginBottom: '0.75rem', fontWeight: 700 }}>Description</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
              {job.description}
            </p>
            {job.notes && (
              <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--accent)' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.375rem' }}>Notes</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{job.notes}</p>
              </div>
            )}
          </div>

          {/* Assignments */}
          <div className="card card-body">
            <h3 style={{ marginBottom: '0.875rem', fontWeight: 700 }}>Assigned Designers</h3>
            {!(job as any).assignments?.length ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No designers assigned yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(job as any).assignments.map((a: any) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                    <Avatar firstName={a.designer?.firstName} lastName={a.designer?.lastName} avatarUrl={a.designer?.avatarUrl} size="md" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.designer?.firstName} {a.designer?.lastName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {format(new Date(a.startTime), 'MMM d, yyyy h:mm a')} → {format(new Date(a.endTime), 'MMM d, yyyy h:mm a')}
                      </div>
                    </div>
                    {a.isPrimary && (
                      <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '0.7rem' }}>Primary</span>
                    )}
                    {canTriage && (
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Edit assignment"
                        onClick={() => openEditAssignment(a)}
                        style={{ flexShrink: 0 }}
                      >
                        <Pencil size={13} />
                      </button>
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
                {uploading && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
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
                        {(parseInt(a.sizeBytes, 10) / 1024 / 1024).toFixed(2)} MB • {a.uploadedBy?.firstName} {a.uploadedBy?.lastName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <a href={a.fileKey.startsWith('http') ? a.fileKey : `http://localhost:3001${a.fileKey}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        View
                      </a>
                      {(isAdmin || isWfAdmin || user?.id === a.uploadedById) && (
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
                      {entry.isSystem && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>auto</span>
                      )}
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

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <h4 style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Details</h4>
            <InfoRow icon={<Calendar size={15} />} label="Deadline" value={job.deadline ? formatDate(job.deadline) : '—'} />
            <InfoRow icon={<Clock size={15} />} label="Created" value={formatDate(job.createdAt)} />
            <InfoRow icon={<User size={15} />} label="Client" value={`${(job as any).client?.firstName ?? ''} ${(job as any).client?.lastName ?? ''}`} />
            {(job as any).stream && (
              <InfoRow
                icon={<span style={{ width: 12, height: 12, borderRadius: '50%', background: (job as any).stream.colorHex, display: 'inline-block' }} />}
                label="Stream"
                value={(job as any).stream.name}
              />
            )}
            {job.billingCode && <InfoRow icon={<Building2 size={15} />} label="Billing Code" value={job.billingCode} />}
            <InfoRow icon={<GitBranch size={15} />} label="Delegation Hops" value={`${job.delegationCount} / 3`} />
          </div>

          {job.rejectionReason && (
            <div className="card card-body" style={{ border: '1px solid rgba(239,68,68,0.25)' }}>
              <h4 style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>Rejection Reason</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{job.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Accept & Assign Modal ─────────────────────────────────────────── */}
      {showAssignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '1.75rem', width: '100%', maxWidth: '500px', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontWeight: 700 }}>Accept &amp; Assign Designer</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAssignModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Designer *</label>
                {loadingDesigners ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={14} className="spinner" /> Loading designers…
                  </div>
                ) : (
                  <select
                    className="form-control"
                    value={assignDesignerId}
                    onChange={(e) => setAssignDesignerId(e.target.value)}
                  >
                    <option value="">Select designer…</option>
                    {designersList.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Start Date &amp; Time *</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={assignStart}
                  onChange={(e) => setAssignStart(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">End Date &amp; Time *</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={assignEnd}
                  onChange={(e) => setAssignEnd(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAssignModal(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleAssignSubmit} disabled={actionLoading || !assignDesignerId || !assignStart || !assignEnd}>
                {actionLoading ? <Loader2 size={13} className="spinner" /> : <UserPlus size={13} />}
                Accept &amp; Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ──────────────────────────────────────────────────── */}
      {showRejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '1.75rem', width: '100%', maxWidth: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontWeight: 700 }}>Reject Job Request</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowRejectModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Reason for rejection *</label>
              <textarea
                className="form-control"
                rows={4}
                placeholder="Explain why this job is being rejected…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowRejectModal(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleRejectSubmit} disabled={actionLoading || !rejectReason.trim()}>
                {actionLoading ? <Loader2 size={13} className="spinner" /> : <X size={13} />}
                Reject Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Assignment Modal ─────────────────────────────────────────── */}
      {showEditAssignModal && editingAssignment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '1.75rem', width: '100%', maxWidth: '500px', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontWeight: 700 }}>Edit Assignment</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowEditAssignModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Designer *</label>
                {loadingDesigners ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={14} className="spinner" /> Loading designers…
                  </div>
                ) : (
                  <select className="form-control" value={editAssignDesignerId} onChange={(e) => setEditAssignDesignerId(e.target.value)}>
                    <option value="">Select designer…</option>
                    {designersList.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Start Date &amp; Time *</label>
                <input type="datetime-local" className="form-control" value={editAssignStart} onChange={(e) => setEditAssignStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">End Date &amp; Time *</label>
                <input type="datetime-local" className="form-control" value={editAssignEnd} onChange={(e) => setEditAssignEnd(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEditAssignModal(false)} disabled={actionLoading}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleEditAssignSubmit} disabled={actionLoading || !editAssignDesignerId || !editAssignStart || !editAssignEnd}>
                {actionLoading ? <Loader2 size={13} className="spinner" /> : <Pencil size={13} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delegate Modal ────────────────────────────────────────────────── */}
      {showDelegateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '1.75rem', width: '100%', maxWidth: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontWeight: 700 }}>Delegate to Another Stream</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowDelegateModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Target Stream *</label>
                {loadingStreams ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={14} className="spinner" /> Loading streams…
                  </div>
                ) : (
                  <select
                    className="form-control"
                    value={delegateStreamId}
                    onChange={(e) => setDelegateStreamId(e.target.value)}
                  >
                    <option value="">Select stream…</option>
                    {streamsList
                      .filter((s: any) => s.id !== (job as any).stream?.id)
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Reason (optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Why is this being delegated?"
                  value={delegateReason}
                  onChange={(e) => setDelegateReason(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDelegateModal(false)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleDelegateSubmit} disabled={actionLoading || !delegateStreamId}>
                {actionLoading ? <Loader2 size={13} className="spinner" /> : <GitBranch size={13} />}
                Delegate
              </button>
            </div>
          </div>
        </div>
      )}
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
