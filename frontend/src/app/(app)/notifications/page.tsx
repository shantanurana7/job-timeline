'use client';
import { useEffect, useState } from 'react';
import { notificationsApi } from '@/services';
import { toast } from '@/stores/toast.store';
import { Bell, Check, Trash2, ExternalLink } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await notificationsApi.list(false);
      setNotifications(res.data);
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications(notifications.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch {
      toast.error('Failed to mark as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
      toast.success('All marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={24} /> Notifications
          </h1>
          <p className="page-subtitle">You have {unreadCount} unread messages</p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-secondary" onClick={handleMarkAllRead}>
            <Check size={16} /> Mark all as read
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '800px' }}>
        {notifications.map((n) => (
          <div key={n.id} className={`card card-body ${!n.isRead ? 'at-risk-pulse' : ''}`} style={{ opacity: n.isRead ? 0.7 : 1, transition: 'opacity 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {!n.isRead && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                  {n.title}
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>{n.message}</p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  {formatRelativeTime(n.createdAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {n.metadata?.link && (
                  <Link href={n.metadata.link}>
                    <button className="btn btn-ghost btn-sm" title="View Related">
                      <ExternalLink size={16} />
                    </button>
                  </Link>
                )}
                {!n.isRead && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleMarkRead(n.id)} title="Mark as read">
                    <Check size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {notifications.length === 0 && (
          <div className="card card-body" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
            <Bell size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
            No notifications yet
          </div>
        )}
      </div>
    </div>
  );
}
