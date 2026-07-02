'use client';
import { useState } from 'react';
import { CheckCircle, Zap } from 'lucide-react';
import { AiActionProposal } from '@/types';
import { formatDate } from '@/lib/utils';

interface ProposalCardProps {
  proposal: AiActionProposal;
  onConfirm: (proposal: AiActionProposal) => Promise<void>;
  onDismiss: (proposalId: string) => void;
  confirmed: boolean;
  dismissed: boolean;
}

export function ProposalCard({ proposal, onConfirm, onDismiss, confirmed, dismissed }: ProposalCardProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(proposal);
    } finally {
      setConfirming(false);
    }
  };

  const cardClass = [
    'proposal-card',
    confirmed ? 'proposal-card--confirmed' : '',
    dismissed ? 'proposal-card--dismissed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const formatLocal = (isoString: string) => {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className={cardClass}>
      <div className="proposal-card-header">
        <Zap size={13} />
        AI Action Proposal
      </div>

      <div className="proposal-card-title">{proposal.description}</div>

      {/* ── Action-specific meta ───────────────────────────────── */}

      {proposal.action === 'assign_designer_to_job' && proposal.payload.startTime && (
        <div className="proposal-card-meta">
          {formatLocal(proposal.payload.startTime)} → {proposal.payload.endTime ? formatLocal(proposal.payload.endTime) : ''}
        </div>
      )}

      {proposal.action === 'create_job' && (
        <div className="proposal-card-meta">
          <span>Title: <strong>{proposal.payload.title}</strong></span>
          {proposal.payload.newPriority && (
            <span style={{ marginLeft: '0.75rem' }}>
              Priority:{' '}
              <span className={`priority-badge priority-${proposal.payload.newPriority.toLowerCase()}`}>
                {proposal.payload.newPriority}
              </span>
            </span>
          )}
        </div>
      )}

      {proposal.action === 'update_job_priority' && proposal.payload.newPriority && (
        <div className="proposal-card-meta">
          New priority:{' '}
          <span className={`priority-badge priority-${proposal.payload.newPriority.toLowerCase()}`}>
            {proposal.payload.newPriority}
          </span>
        </div>
      )}

      {proposal.action === 'update_job_deadline' && proposal.payload.newDeadline && (
        <div className="proposal-card-meta">
          New deadline: <strong>{formatDate(proposal.payload.newDeadline)}</strong>
        </div>
      )}

      {proposal.action === 'add_job_note' && proposal.payload.note && (
        <div
          className="proposal-card-meta"
          style={{
            fontStyle: 'italic',
            borderLeft: '2px solid var(--border-strong)',
            paddingLeft: '0.625rem',
            marginTop: '0.375rem',
          }}
        >
          &ldquo;{proposal.payload.note.length > 120
            ? `${proposal.payload.note.slice(0, 120)}…`
            : proposal.payload.note}&rdquo;
        </div>
      )}

      {proposal.action === 'remove_assignment' && (
        <div className="proposal-card-meta">
          {proposal.payload.assignmentId
            ? `Assignment ID: ${proposal.payload.assignmentId}`
            : 'No active assignment found — please verify before confirming.'}
        </div>
      )}

      {/* ── Status ────────────────────────────────────────────── */}

      {confirmed && (
        <div className="proposal-card-status proposal-card-status--confirmed">
          <CheckCircle size={14} /> Executed successfully
        </div>
      )}

      {dismissed && (
        <div className="proposal-card-status proposal-card-status--dismissed">
          Dismissed
        </div>
      )}

      {!confirmed && !dismissed && (
        <div className="proposal-card-actions">
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? 'Executing…' : 'Confirm'}
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}
            onClick={() => onDismiss(proposal.id)}
            disabled={confirming}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
