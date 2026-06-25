'use client';
import { useEffect, useState } from 'react';
import { settingsApi } from '@/services';
import { toast } from '@/stores/toast.store';
import { Settings, Save } from 'lucide-react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await settingsApi.list();
      setSettings(res.data);
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      await settingsApi.update(key, value);
      toast.success('Setting saved');
      await loadData();
    } catch {
      toast.error('Failed to save setting');
    } finally {
      setSavingKey(null);
    }
  };

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
            <Settings size={24} /> Settings
          </h1>
          <p className="page-subtitle">Configure system-wide application settings</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '800px' }}>
        {settings.map((s) => (
          <div key={s.id} className="card card-body">
            <h4 style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{s.key}</h4>
            {s.description && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>{s.description}</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type={s.isSecret ? 'password' : 'text'}
                className="input"
                defaultValue={s.value}
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave(s.key, e.currentTarget.value);
                }}
                onBlur={(e) => {
                  if (e.target.value !== s.value) handleSave(s.key, e.target.value);
                }}
              />
              {savingKey === s.key && <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
            </div>
          </div>
        ))}

        {settings.length === 0 && (
          <div className="card card-body" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
            No settings found.
          </div>
        )}
      </div>
    </div>
  );
}
