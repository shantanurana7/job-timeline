'use client';
import { useEffect, useState } from 'react';
import { usersApi } from '@/services';
import { User, Role } from '@/types';
import Avatar from '@/components/ui/Avatar';
import { formatDate } from '@/lib/utils';
import { toast } from '@/stores/toast.store';
import { Users, UserCheck, UserX, Shield, Briefcase, Palette, Search } from 'lucide-react';

const ROLES: Role[] = ['ADMIN', 'WORKFLOW_ADMIN', 'DESIGNER', 'CLIENT'];

const ROLE_ICONS: Record<Role, React.ReactNode> = {
  ADMIN: <Shield size={14} />,
  WORKFLOW_ADMIN: <UserCheck size={14} />,
  DESIGNER: <Palette size={14} />,
  CLIENT: <Briefcase size={14} />,
};

const ROLE_COLORS: Record<Role, string> = {
  ADMIN: '#6366f1', WORKFLOW_ADMIN: '#8b5cf6', DESIGNER: '#06b6d4', CLIENT: '#22c55e',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<Role | ''>('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterRole) params.role = filterRole;
      const res = await usersApi.list(params);
      setUsers(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterRole]);

  const filtered = search
    ? users.filter((u) =>
        `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
    : users;

  const handleDeactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return;
    try {
      await usersApi.deactivate(id);
      toast.success(`${name} deactivated`);
      load();
    } catch {
      toast.error('Failed to deactivate user');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Members</h1>
          <p className="page-subtitle">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: 'auto', padding: '0.5rem 0.875rem' }}
          value={filterRole} onChange={(e) => setFilterRole(e.target.value as any)}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th><th>Role</th><th>Email</th><th>Work Hours</th><th>Last Login</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} style={{ cursor: 'default' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Avatar firstName={u.firstName} lastName={u.lastName} size="md" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.firstName} {u.lastName}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={{ background: `${ROLE_COLORS[u.role]}20`, color: ROLE_COLORS[u.role] }}>
                      {ROLE_ICONS[u.role]} {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {u.workHoursStart} – {u.workHoursEnd}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {u.lastLoginAt ? formatDate(u.lastLoginAt, { time: true }) : 'Never'}
                  </td>
                  <td>
                    <span className="badge" style={u.isActive
                      ? { background: 'var(--success-soft)', color: 'var(--success)' }
                      : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    {u.isActive && u.role !== 'ADMIN' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => handleDeactivate(u.id, `${u.firstName} ${u.lastName}`)}
                      >
                        <UserX size={14} /> Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
