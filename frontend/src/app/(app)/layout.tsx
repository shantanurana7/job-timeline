'use client';
import Sidebar from '@/components/layout/Sidebar';
import AuthProvider from '@/components/providers/AuthProvider';
import { Bell } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

function Topbar() {
  const { user } = useAuthStore();
  return (
    <header className="topbar">
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn btn-ghost btn-icon" style={{ position: 'relative' }} aria-label="Notifications">
          <Bell size={18} />
          <span style={{
            position: 'absolute', top: '4px', right: '4px',
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--danger)',
            border: '1.5px solid var(--bg-surface)',
          }} />
        </button>
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
      </div>
    </AuthProvider>
  );
}
