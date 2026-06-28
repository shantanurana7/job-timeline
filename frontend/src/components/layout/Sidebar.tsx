'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, Calendar, Users, Settings,
  LogOut, Zap, BarChart2, Layers,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useAiStore } from '@/stores/ai.store';
import { authApi } from '@/services';
import Avatar from '@/components/ui/Avatar';
import { Role } from '@/types';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Client Portal', href: '/portal', icon: <LayoutDashboard size={18} />, roles: ['CLIENT'] },
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} />, roles: ['ADMIN', 'WORKFLOW_ADMIN', 'DESIGNER'] },
  { label: 'Jobs', href: '/jobs', icon: <Briefcase size={18} />, roles: ['ADMIN', 'WORKFLOW_ADMIN', 'DESIGNER'] },
  { label: 'Timeline', href: '/timeline', icon: <Calendar size={18} />, roles: ['ADMIN', 'WORKFLOW_ADMIN'] },
  { label: 'Team', href: '/admin/users', icon: <Users size={18} />, roles: ['ADMIN', 'WORKFLOW_ADMIN'] },
  { label: 'Analytics', href: '/analytics', icon: <BarChart2 size={18} />, roles: ['ADMIN', 'WORKFLOW_ADMIN'] },
  { label: 'AI Agent', href: '/ai', icon: <Zap size={18} />, roles: ['WORKFLOW_ADMIN'] },
  { label: 'Streams', href: '/admin/streams', icon: <Layers size={18} />, roles: ['ADMIN', 'WORKFLOW_ADMIN'] },
  { label: 'Settings', href: '/admin/settings', icon: <Settings size={18} />, roles: ['ADMIN'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken') || '';
    try { await authApi.logout(refreshToken); } catch {}
    localStorage.removeItem('refreshToken');
    logout();
    useAiStore.getState().clear();
    window.location.href = '/login';
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Calendar size={16} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.2 }}>JobTimeline</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {user?.role?.replace('_', ' ')}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.75rem 0.625rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.label} href={item.href}>
                <div className={`nav-link${isActive ? ' active' : ''}`}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Footer */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem', borderRadius: 'var(--radius)', marginBottom: '0.375rem' }}>
          <Avatar firstName={user?.firstName} lastName={user?.lastName} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.2 }} className="truncate">
              {user?.firstName} {user?.lastName}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="truncate">
              {user?.email}
            </div>
          </div>
        </div>
        <button className="nav-link" onClick={handleLogout} style={{ color: 'var(--danger)', width: '100%' }}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
