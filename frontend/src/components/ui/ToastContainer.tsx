'use client';
import { useToastStore } from '@/stores/toast.store';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const icons = {
  success: <CheckCircle size={18} color="var(--success)" />,
  error: <XCircle size={18} color="var(--danger)" />,
  warning: <AlertTriangle size={18} color="var(--warning)" />,
  info: <Info size={18} color="var(--info)" />,
};

export default function ToastContainer() {
  const { toasts, remove } = useToastStore();
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span style={{ flexShrink: 0 }}>{icons[t.type]}</span>
          <div style={{ flex: 1 }}>
            {t.title && <div style={{ fontWeight: 600, marginBottom: '0.125rem' }}>{t.title}</div>}
            <div style={{ color: 'var(--text-secondary)' }}>{t.message}</div>
          </div>
          <button className="btn-icon btn-ghost" onClick={() => remove(t.id)} style={{ flexShrink: 0, padding: '0.25rem' }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
