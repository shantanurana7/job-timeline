'use client';
import { useState } from 'react';
import { CheckCircle, Zap } from 'lucide-react';
import { AiActionProposal } from '@/types';

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

  return (
    <div className={cardClass}>
      <div className="proposal-card-header">
        <Zap size={13} />
        AI Action Proposal
      </div>

      <div className="proposal-card-title">{proposal.description}</div>

      {proposal.action === 'assign_designer_to_job' && proposal.payload.startTime && (
        <div className="proposal-card-meta">
          {proposal.payload.startTime.slice(0, 10)} → {proposal.payload.endTime?.slice(0, 10)}
        </div>
      )}

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
