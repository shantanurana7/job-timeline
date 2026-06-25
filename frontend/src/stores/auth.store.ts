import { create } from 'zustand';
import { User } from '@/types';
import { setAccessToken } from '@/services/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: User | null, token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user, token) => {
    setAccessToken(token);
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    });
  },

  logout: () => {
    setAccessToken(null);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
