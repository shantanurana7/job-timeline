'use client';
import { useState } from 'react';
import { usersApi } from '@/services';
import { User, Role } from '@/types';
import { toast } from '@/stores/toast.store';
import { X, Loader2, UserPlus, Save } from 'lucide-react';

interface Props {
  mode: 'create' | 'edit';
  user?: User;
  onClose: () => void;
  onSuccess: () => void;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'WORKFLOW_ADMIN', label: 'Workflow Admin' },
  { value: 'DESIGNER', label: 'Designer' },
  { value: 'CLIENT', label: 'Client' },
];

export default function UserModal({ mode, user, onClose, onSuccess }: Props) {
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'DESIGNER');
  const [workHoursStart, setWorkHoursStart] = useState(user?.workHoursStart ?? '09:00');
  const [workHoursEnd, setWorkHoursEnd] = useState(user?.workHoursEnd ?? '17:00');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create' && !password.trim()) {
      toast.error('Password is required for new users');
      return;
    }

    const payload: Record<string, string> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      role,
      workHoursStart,
      workHoursEnd,
    };
    if (password.trim()) payload.password = password.trim();

    setSubmitting(true);
    try {
      if (mode === 'create') {
        await usersApi.create(payload);
        toast.success(`${firstName} ${lastName} added to the team`);
      } else {
        await usersApi.update(user!.id, payload);
        toast.success(`${firstName} ${lastName} updated`);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to ${mode === 'create' ? 'create' : 'update'} user`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: '1.75rem',
        width: '100%', maxWidth: '520px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1.0625rem' }}>
            {mode === 'create' ? 'Add New User' : `Edit ${user?.firstName} ${user?.lastName}`}
          </h3>
          <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="um-first-name">First Name *</label>
              <input
                id="um-first-name"
                type="text"
                className="form-control"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="um-last-name">Last Name *</label>
              <input
                id="um-last-name"
                type="text"
                className="form-control"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" htmlFor="um-email">Email *</label>
            <input
              id="um-email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane.smith@company.com"
              required
            />
          </div>

          {/* Password */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" htmlFor="um-password">
              Password{mode === 'create' && ' *'}
              {mode === 'edit' && (
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.375rem', fontSize: '0.8125rem' }}>
                  — leave blank to keep current
                </span>
              )}
            </label>
            <input
              id="um-password"
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'create' ? 'Min. 8 characters' : '••••••••'}
              autoComplete="new-password"
            />
          </div>

          {/* Role */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" htmlFor="um-role">Role *</label>
            <select
              id="um-role"
              className="form-control"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Work Hours */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="um-hours-start">Work Hours Start</label>
              <input
                id="um-hours-start"
                type="time"
                className="form-control"
                value={workHoursStart}
                onChange={(e) => setWorkHoursStart(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="um-hours-end">Work Hours End</label>
              <input
                id="um-hours-end"
                type="time"
                className="form-control"
                value={workHoursEnd}
                onChange={(e) => setWorkHoursEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting
                ? <Loader2 size={13} className="spinner" />
                : mode === 'create' ? <UserPlus size={13} /> : <Save size={13} />
              }
              {mode === 'create' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
