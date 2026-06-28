'use client';
import { useEffect, useState } from 'react';
import { streamsApi, usersApi } from '@/services';
import { toast } from '@/stores/toast.store';
import { Stream, User } from '@/types';
import { Layers, Plus, X } from 'lucide-react';

interface StreamForm {
  name: string;
  description: string;
  colorHex: string;
  workflowAdminId: string;
}

const DEFAULT_FORM: StreamForm = {
  name: '',
  description: '',
  colorHex: '#6366f1',
  workflowAdminId: '',
};

export default function AdminStreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [workflowAdmins, setWorkflowAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<StreamForm>(DEFAULT_FORM);

  const loadStreams = async () => {
    try {
      const res = await streamsApi.list();
      setStreams(res.data || []);
    } catch {
      toast.error('Failed to load streams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStreams();
    usersApi.list({ role: 'WORKFLOW_ADMIN', isActive: true })
      .then((r) => setWorkflowAdmins(r.data || []))
      .catch(() => {});
  }, []);

  const openModal = () => {
    setForm(DEFAULT_FORM);
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Stream name is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await streamsApi.create({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        colorHex: form.colorHex,
      });

      const newStreamId: string = res.data?.id;

      if (newStreamId && form.workflowAdminId) {
        await streamsApi.addMember(newStreamId, form.workflowAdminId, true);
      }

      toast.success(`Stream "${form.name.trim()}" created`);
      setShowModal(false);
      setLoading(true);
      await loadStreams();
    } catch {
      toast.error('Failed to create stream');
    } finally {
      setSubmitting(false);
    }
  };

  const set = (field: keyof StreamForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={24} /> Streams
          </h1>
          <p className="page-subtitle">Manage creative streams and divisions</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          <Plus size={16} /> New Stream
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Color</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: s.colorHex }} />
                  </td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.description || '—'}</td>
                  <td>
                    <span className="badge" style={{
                      background: s.isActive ? 'var(--success-soft)' : 'var(--danger-soft)',
                      color: s.isActive ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
              {streams.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No streams found. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Stream Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 0, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.0625rem' }}>New Stream</h2>
              <button className="btn btn-ghost btn-icon" onClick={closeModal} disabled={submitting}>
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit}>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>

                <div className="form-group">
                  <label className="form-label" htmlFor="stream-name">
                    Stream Name <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    id="stream-name"
                    className="form-control"
                    type="text"
                    placeholder="e.g. Brand Design"
                    value={form.name}
                    onChange={set('name')}
                    autoFocus
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="stream-description">Description</label>
                  <input
                    id="stream-description"
                    className="form-control"
                    type="text"
                    placeholder="Optional — brief description of this stream"
                    value={form.description}
                    onChange={set('description')}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="stream-color">Stream Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <input
                      id="stream-color"
                      type="color"
                      value={form.colorHex}
                      onChange={set('colorHex')}
                      style={{
                        width: 40, height: 36, padding: '2px', cursor: 'pointer',
                        border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
                        background: 'var(--bg-elevated)',
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {form.colorHex}
                    </span>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: form.colorHex, flexShrink: 0,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="stream-admin">Workflow Admin</label>
                  <select
                    id="stream-admin"
                    className="form-control"
                    value={form.workflowAdminId}
                    onChange={set('workflowAdminId')}
                  >
                    <option value="">— Select workflow admin (optional) —</option>
                    {workflowAdmins.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal footer */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !form.name.trim()}>
                  {submitting ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Creating…</> : <><Plus size={15} /> Create Stream</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
