'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Eye, EyeOff, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/services';
import { setAccessToken } from '@/services/api';
import { toast } from '@/stores/toast.store';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authApi.login(email, password);
      const { accessToken, refreshToken, user } = res.data;

      setAccessToken(accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user, accessToken);

      toast.success(`Welcome back, ${user.firstName}!`);
      router.replace('/dashboard');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Invalid credentials. Please try again.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: string) => {
    const creds: Record<string, { email: string; password: string }> = {
      admin: { email: 'admin@jobtimeline.local', password: 'Admin1234!' },
      wa: { email: 'wa.brand@jobtimeline.local', password: 'Password1234!' },
      designer: { email: 'alex.chen@jobtimeline.local', password: 'Password1234!' },
      client: { email: 'client.acme@jobtimeline.local', password: 'Password1234!' },
    };
    if (creds[role]) {
      setEmail(creds[role].email);
      setPassword(creds[role].password);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card fade-in">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
          <div style={{
            width: 42, height: 42, borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px var(--accent-glow)',
          }}>
            <Calendar size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em' }}>JobTimeline</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.05rem' }}>
              Enterprise Management Platform
            </p>
          </div>
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.375rem' }}>Welcome back</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
          Sign in to your account to continue
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              id="email"
              type="email"
              className="form-control"
              placeholder="you@jobtimeline.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ paddingRight: '2.75rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '0.75rem', top: '50%',
                  transform: 'translateY(-50%)', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius)', padding: '0.625rem 0.875rem',
              color: 'var(--danger)', fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ marginTop: '0.25rem', justifyContent: 'center', width: '100%' }}
            disabled={loading}
          >
            {loading ? (
              <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Signing in…</>
            ) : 'Sign in'}
          </button>
        </form>

        {/* Quick fill demo accounts */}
        <div style={{ marginTop: '1.75rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textAlign: 'center' }}>
            Demo accounts — click to fill
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {[
              { role: 'admin', label: 'Admin', color: '#6366f1' },
              { role: 'wa', label: 'Workflow Admin', color: '#8b5cf6' },
              { role: 'designer', label: 'Designer', color: '#06b6d4' },
              { role: 'client', label: 'Client', color: '#22c55e' },
            ].map((d) => (
              <button
                key={d.role}
                type="button"
                onClick={() => fillDemo(d.role)}
                className="btn btn-secondary btn-sm"
                style={{ justifyContent: 'center', borderColor: `${d.color}40` }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
