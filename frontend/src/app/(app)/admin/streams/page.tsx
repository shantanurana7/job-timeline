'use client';
import { useEffect, useState } from 'react';
import { streamsApi } from '@/services';
import { toast } from '@/stores/toast.store';
import { Stream } from '@/types';
import { Layers, Plus, Trash2 } from 'lucide-react';

export default function AdminStreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await streamsApi.list();
      setStreams(res.data);
    } catch {
      toast.error('Failed to load streams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

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
        <button className="btn btn-primary">
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
                <th style={{ textAlign: 'right' }}>Actions</th>
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
                    <span className="badge" style={{ background: s.isActive ? 'var(--success-soft)' : 'var(--danger-soft)', color: s.isActive ? 'var(--success)' : 'var(--danger)' }}>
                      {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {streams.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No streams found. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
