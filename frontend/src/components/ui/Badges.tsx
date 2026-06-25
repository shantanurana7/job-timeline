import { JobStatus, JobPriority } from '@/types';
import { getStatusLabel, getPriorityLabel } from '@/lib/utils';

interface StatusBadgeProps {
  status: JobStatus;
  size?: 'sm' | 'md';
}
export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  return (
    <span
      className={`badge status-${status}`}
      style={size === 'sm' ? { fontSize: '0.7rem', padding: '0.15rem 0.5rem' } : {}}
    >
      {getStatusLabel(status)}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: JobPriority;
  size?: 'sm' | 'md';
}
export function PriorityBadge({ priority, size = 'md' }: PriorityBadgeProps) {
  return (
    <span
      className={`badge priority-${priority}`}
      style={size === 'sm' ? { fontSize: '0.7rem', padding: '0.15rem 0.5rem' } : {}}
    >
      {getPriorityLabel(priority)}
    </span>
  );
}
