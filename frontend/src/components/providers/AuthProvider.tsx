'use client';
import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/services';
import { setAccessToken } from '@/services/api';

const PUBLIC_ROUTES = ['/login'];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setUser, isLoading, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        setUser(null, null);
        return;
      }

      try {
        const refreshRes = await authApi.refresh(refreshToken);
        const newAccessToken = refreshRes.data.accessToken;
        const newRefreshToken = refreshRes.data.refreshToken;

        setAccessToken(newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        const meRes = await authApi.me();
        setUser(meRes.data, newAccessToken);
      } catch {
        localStorage.removeItem('refreshToken');
        setUser(null, null);
      }
    };

    init();
  }, [setUser]);

  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    const isClient = user?.role === 'CLIENT';

    if (!isAuthenticated && !isPublic) {
      router.replace('/login');
      return;
    }

    if (isAuthenticated) {
      // Redirect from public routes (e.g. /login) to role home
      if (isPublic) {
        router.replace(isClient ? '/portal' : '/dashboard');
        return;
      }
      // Redirect CLIENT landing on /dashboard (root page server-redirect target) to portal
      if (isClient && pathname === '/dashboard') {
        router.replace('/portal');
        return;
      }
      // Redirect non-CLIENT attempting to access portal to dashboard
      if (!isClient && pathname.startsWith('/portal')) {
        router.replace('/dashboard');
        return;
      }
    }
  }, [isAuthenticated, isLoading, pathname, router, user]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="spinner spinner-lg" />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading…</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
