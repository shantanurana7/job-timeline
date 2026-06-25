'use client';
import { useState, useRef, useEffect } from 'react';
import { aiApi } from '@/services';
import { toast } from '@/stores/toast.store';
import { Zap, Send, User, Bot, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AiChatPage() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your AI workflow assistant. How can I help you today? I can help you find jobs at risk, assign designers, or analyze your workload." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    const newHistory = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const res = await aiApi.chat(userMessage, messages.filter(m => m.role !== 'assistant' || m.content !== '...'));
      setMessages([...newHistory, { role: 'assistant', content: res.reply }]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to get AI response');
      // Revert optimism if needed or just add error message
      setMessages([...newHistory, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', maxWidth: '900px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '1rem', flexShrink: 0 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={24} color="var(--accent)" /> AI Workflow Agent
          </h1>
          <p className="page-subtitle">Powered by Gemini. Ask me to manage your timeline or find jobs.</p>
        </div>
      </div>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                color: msg.role === 'user' ? 'white' : 'var(--accent)',
              }}>
                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
              </div>
              
              <div style={{
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                padding: '1rem 1.25rem',
                borderRadius: '1rem',
                borderTopRightRadius: msg.role === 'user' ? 4 : '1rem',
                borderTopLeftRadius: msg.role === 'assistant' ? 4 : '1rem',
                maxWidth: '75%',
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                boxShadow: msg.role === 'user' ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none',
              }}>
                {msg.role === 'user' ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                ) : (
                  <div className="markdown-body" style={{ color: 'inherit' }}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
               <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--bg-elevated)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--accent)',
              }}>
                <Bot size={18} />
              </div>
              <div style={{
                background: 'var(--bg-elevated)',
                padding: '1rem 1.25rem',
                borderRadius: '1rem',
                borderTopLeftRadius: 4,
              }}>
                <Loader2 size={18} className="spinner" style={{ color: 'var(--accent)' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, paddingRight: '3rem', borderRadius: '2rem' }}
              placeholder="Ask the AI agent..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ 
                position: 'absolute', right: '4px', top: '4px', bottom: '4px',
                width: '32px', padding: 0, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              disabled={loading || !input.trim()}
            >
              <Send size={14} />
            </button>
          </form>
          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            AI can make mistakes. Verify important workflow changes.
          </div>
        </div>
      </div>
    </div>
  );
}
