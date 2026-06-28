'use client';
import { useState, useRef, useEffect } from 'react';
import { aiApi, assignmentsApi, jobsApi } from '@/services';
import { toast } from '@/stores/toast.store';
import { Zap, Send, User, Bot, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ProposalCard } from '@/components/ui/ProposalCard';
import { useAiStore } from '@/stores/ai.store';
import { AiActionProposal, JobStatus } from '@/types';

export default function AiChatPage() {
  const { messages, input, loading, addMessage, setInput, setLoading } = useAiStore();
  const [confirmedProposals, setConfirmedProposals] = useState<Set<string>>(new Set());
  const [dismissedProposals, setDismissedProposals] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      <div className="page-header" style={{ marginBottom: '1rem', flexShrink: 0 }}>
        <div>
          <h1
            className="page-title"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Zap size={24} color="var(--accent)" /> AI Workflow Agent
          </h1>
          <p className="page-subtitle">
            Ask me to manage your timeline, assign designers, or change job statuses.
          </p>
        </div>
      </div>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background:
                    msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: msg.role === 'user' ? 'white' : 'var(--accent)',
                }}
              >
                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
              </div>

              <div
                style={{
                  maxWidth: '75%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{
                    background:
                      msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color:
                      msg.role === 'user' ? 'white' : 'var(--text-primary)',
                    padding: '1rem 1.25rem',
                    borderRadius: '1rem',
                    borderTopRightRadius: msg.role === 'user' ? 4 : '1rem',
                    borderTopLeftRadius: msg.role === 'assistant' ? 4 : '1rem',
                    fontSize: '0.9375rem',
                    lineHeight: 1.6,
                    boxShadow:
                      msg.role === 'user'
                        ? '0 4px 12px rgba(99, 102, 241, 0.2)'
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
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--accent)',
                }}
              >
                <Bot size={18} />
              </div>
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  padding: '1rem 1.25rem',
                  borderRadius: '1rem',
                  borderTopLeftRadius: 4,
                }}
              >
                <Loader2 size={18} className="spinner" style={{ color: 'var(--accent)' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div
          style={{
            padding: '1rem 1.25rem 1.125rem',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
          }}
        >
          <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-control"
              style={{
                width: '100%',
                paddingTop: '0.75rem',
                paddingBottom: '0.75rem',
                paddingLeft: '1.25rem',
                paddingRight: '3.5rem',
                borderRadius: '2rem',
                background: 'var(--bg-elevated)',
                fontSize: '0.9375rem',
                border: '1.5px solid var(--border-strong)',
                boxShadow: input.trim()
                  ? '0 0 0 3px var(--accent-soft), 0 2px 12px rgba(99,102,241,0.08)'
                  : '0 1px 4px rgba(0,0,0,0.08)',
                transition: 'box-shadow 0.2s ease',
              }}
              placeholder="Ask the AI agent…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '38px',
                height: '38px',
                padding: 0,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
                opacity: loading || !input.trim() ? 0.45 : 1,
                transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
              }}
              disabled={loading || !input.trim()}
            >
              <Send size={15} />
            </button>
          </form>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '0.625rem',
              padding: '0 0.375rem',
            }}
          >
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', letterSpacing: '0.01em' }}>
              Powered by <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Groq</span>
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              AI can make mistakes. Always verify proposals before confirming.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
