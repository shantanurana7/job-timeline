'use client';
import { useRef, useEffect, useState } from 'react';
import { aiApi, assignmentsApi, jobsApi } from '@/services';
import { toast } from '@/stores/toast.store';
import { Zap, Send, User, Bot, Loader2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ProposalCard } from '@/components/ui/ProposalCard';
import { useAiStore } from '@/stores/ai.store';
import { AiActionProposal, JobStatus } from '@/types';

export default function AiDrawer() {
  const { messages, input, loading, isOpen, addMessage, setInput, setLoading, setOpen } =
    useAiStore();
  const [confirmedProposals, setConfirmedProposals] = useState<Set<string>>(new Set());
  const [dismissedProposals, setDismissedProposals] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  }, [messages, loading, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    const historyForApi = messages.map((m) => ({ role: m.role, content: m.content }));

    setInput('');
    addMessage({ role: 'user', content: userMessage });
    setLoading(true);

    try {
      const res = await aiApi.chat(userMessage, historyForApi);
      const { reply, proposal } = res.data;
      addMessage({ role: 'assistant', content: reply, proposal });
    } catch {
      toast.error('Failed to get AI response');
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (proposal: AiActionProposal) => {
    try {
      if (proposal.action === 'assign_designer_to_job') {
        await assignmentsApi.assign({
          jobId: proposal.payload.jobId,
          designerId: proposal.payload.designerId,
          startTime: proposal.payload.startTime,
          endTime: proposal.payload.endTime,
          isPrimary: true,
        });
      } else if (proposal.action === 'change_job_status') {
        await jobsApi.changeStatus(
          proposal.payload.jobId,
          proposal.payload.newStatus as JobStatus,
        );
      }
      toast.success('Action executed successfully');
      setConfirmedProposals((prev) => new Set([...prev, proposal.id]));
    } catch {
      toast.error('Action failed — please try again');
    }
  };

  const handleDismiss = (proposalId: string) => {
    setDismissedProposals((prev) => new Set([...prev, proposalId]));
  };

  return (
    <div className={`ai-drawer${isOpen ? ' ai-drawer--open' : ''}`} aria-label="AI Workflow Agent panel">
      {/* Header */}
      <div className="ai-drawer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Zap size={14} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>
              AI Workflow Agent
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600 }}>
              Powered by Groq
            </div>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setOpen(false)}
          aria-label="Close AI panel"
          style={{ flexShrink: 0 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="ai-drawer-body">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              gap: '0.625rem',
              alignItems: 'flex-start',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: msg.role === 'user' ? 'white' : 'var(--accent)',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              }}
            >
              {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
            </div>

            <div
              style={{
                maxWidth: '83%',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              <div
                style={{
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '0.875rem',
                  borderTopRightRadius: msg.role === 'user' ? 4 : '0.875rem',
                  borderTopLeftRadius: msg.role === 'assistant' ? 4 : '0.875rem',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  boxShadow:
                    msg.role === 'user'
                      ? '0 2px 8px rgba(99,102,241,0.2)'
                      : 'none',
                }}
              >
                {msg.role === 'user' ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                ) : (
                  <div className="markdown-body" style={{ color: 'inherit' }}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>

              {msg.proposal && (
                <ProposalCard
                  proposal={msg.proposal}
                  onConfirm={handleConfirm}
                  onDismiss={handleDismiss}
                  confirmed={confirmedProposals.has(msg.proposal.id)}
                  dismissed={dismissedProposals.has(msg.proposal.id)}
                />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--accent)',
              }}
            >
              <Bot size={13} />
            </div>
            <div
              style={{
                background: 'var(--bg-elevated)',
                padding: '0.625rem 0.875rem',
                borderRadius: '0.875rem',
                borderTopLeftRadius: 4,
              }}
            >
              <Loader2 size={15} className="spinner" style={{ color: 'var(--accent)' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-drawer-footer">
        <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
          <input
            type="text"
            className="form-control"
            style={{
              paddingTop: '0.625rem',
              paddingBottom: '0.625rem',
              paddingLeft: '1rem',
              paddingRight: '3rem',
              borderRadius: '2rem',
              background: 'var(--bg-elevated)',
              fontSize: '0.875rem',
              border: '1.5px solid var(--border-strong)',
              boxShadow: input.trim()
                ? '0 0 0 3px var(--accent-soft), 0 1px 6px rgba(99,102,241,0.08)'
                : '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'box-shadow 0.2s ease',
            }}
            placeholder="Ask the AI agent…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              position: 'absolute',
              right: '5px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading || !input.trim() ? 0.45 : 1,
              transition: 'opacity 0.15s ease',
            }}
            disabled={loading || !input.trim()}
          >
            <Send size={13} />
          </button>
        </form>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '0.375rem',
            padding: '0 0.25rem',
          }}
        >
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            AI can make mistakes. Always verify before confirming.
          </span>
        </div>
      </div>
    </div>
  );
}
