'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { jobsApi, streamsApi } from '@/services';
import { Stream, JobPriority } from '@/types';
import { toast } from '@/stores/toast.store';
import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';

export default function NewJobPage() {
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM' as JobPriority,
    deadline: '', billingCode: '', streamId: '', notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { streamsApi.list().then((r) => setStreams(r.data || [])); }, []);

  const set = (field: string, val: string) => {
    setForm((f) => ({ ...f, [field]: val }));
    setErrors((e) => ({ ...e, [field]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.description.trim()) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload: any = {
        title: form.title, description: form.description,
        priority: form.priority,
      };
      if (form.deadline) payload.deadline = new Date(form.deadline).toISOString();
      if (form.billingCode) payload.billingCode = form.billingCode;
      if (form.streamId) payload.streamId = form.streamId;
      if (form.notes) payload.notes = form.notes;

      const res = await jobsApi.create(payload);
      toast.success(`Job ${res.data.jobNumber} created!`);
      router.push(`/jobs/${res.data.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Link href="/jobs">
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={16} /> Back to Jobs
        </button>
      </Link>

      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Submit New Job</h1>
          <p className="page-subtitle">Fill in the details below to create a new job request</p>
        </div>
      </div>

      <div style={{ maxWidth: 760 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card card-body">
            <h3 style={{ fontWeight: 700, marginBottom: '1.25rem' }}>Job Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input id="job-title" className="form-control" placeholder="e.g. Annual Report Cover Design"
                  value={form.title} onChange={(e) => set('title', e.target.value)} />
                {errors.title && <span className="form-error">{errors.title}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Description *</label>
                <textarea id="job-description" className="form-control" rows={5}
                  placeholder="Describe the job requirements, goals, and any relevant context…"
                  value={form.description} onChange={(e) => set('description', e.target.value)} />
                {errors.description && <span className="form-error">{errors.description}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select id="job-priority" className="form-control" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Stream</label>
                  <select id="job-stream" className="form-control" value={form.streamId} onChange={(e) => set('streamId', e.target.value)}>
                    <option value="">— Select stream —</option>
                    {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Deadline</label>
                  <input id="job-deadline" type="datetime-local" className="form-control"
                    value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
                </div>

                <div className="form-group">
                  <label className="form-label">Billing Code</label>
                  <input id="job-billing" className="form-control" placeholder="e.g. ACME-2024"
                    value={form.billingCode} onChange={(e) => set('billingCode', e.target.value)} maxLength={20} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Internal Notes</label>
                <textarea id="job-notes" className="form-control" rows={3}
                  placeholder="Optional internal notes for the team…"
                  value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Link href="/jobs"><button type="button" className="btn btn-secondary">Cancel</button></Link>
            <button id="submit-job" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Send size={16} />}
              Submit Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
