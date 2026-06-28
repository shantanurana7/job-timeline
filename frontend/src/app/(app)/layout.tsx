'use client';
import Sidebar from '@/components/layout/Sidebar';
import AiDrawer from '@/components/layout/AiDrawer';
import AuthProvider from '@/components/providers/AuthProvider';
import { Bell, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useAiStore } from '@/stores/ai.store';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notificationsApi } from '@/services';
import { useSocket } from '@/hooks/useSocket';

function Topbar() {
  const { user } = useAuthStore();
  const { toggleOpen: toggleAi } = useAiStore();
  const socket = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    notificationsApi.list(true).then((res) => {
      setUnreadCount(res.data?.length || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('notification', () => {
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.off('notification');
    };
  }, [socket]);

  return (
    <header className="topbar">
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {user?.role === 'WORKFLOW_ADMIN' && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleAi}
            aria-label="AI Workflow Agent"
            title="AI Workflow Agent"
            style={{ color: 'var(--accent)' }}
          >
            <Zap size={18} />
          </button>
        )}
        <Link href="/notifications">
          <button
            className="btn btn-ghost btn-icon"
            style={{ position: 'relative' }}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'var(--danger)',
                  color: 'white',
                  border: '1.5px solid var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </Link>
        <div style={{ height: 24, width: 1, background: 'var(--border)' }} />
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {user?.firstName} {user?.lastName}
        </div>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Sidebar />
        <div className="main-content">
          <Topbar />
          <main className="page fade-in">
            {children}
          </main>
        </div>
        <AiDrawer />
      </div>
    </AuthProvider>
  );
}
