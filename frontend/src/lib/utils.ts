import { JobStatus, JobPriority } from '@/types';

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(date?: string | null, opts?: { time?: boolean }): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  if (opts?.time) {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function getInitials(firstName?: string, lastName?: string): string {
  return `${(firstName?.[0] ?? '').toUpperCase()}${(lastName?.[0] ?? '').toUpperCase()}`;
}

export function getStatusLabel(status: JobStatus): string {
  const map: Record<JobStatus, string> = {
    SUBMITTED: 'Submitted',
    UNDER_REVIEW: 'Under Review',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
    DELEGATED: 'Delegated',
    ASSIGNED: 'Assigned',
    IN_PROGRESS: 'In Progress',
    PAUSED: 'Paused',
    AT_RISK: 'At Risk',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    ON_HOLD: 'On Hold',
  };
  return map[status] ?? status;
}

export function getPriorityLabel(priority: JobPriority): string {
  const map: Record<JobPriority, string> = {
    LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
  };
  return map[priority] ?? priority;
}

export function deadlineCountdown(deadline?: string | null): { label: string; urgent: boolean } {
  if (!deadline) return { label: 'No deadline', urgent: false };
  const now = new Date();
  const d = new Date(deadline);
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return { label: 'Overdue', urgent: true };
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hours < 24) return { label: `${hours}h remaining`, urgent: true };
  if (days < 3) return { label: `${days}d remaining`, urgent: true };
  return { label: `${days}d remaining`, urgent: false };
}
