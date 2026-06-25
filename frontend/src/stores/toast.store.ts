import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastStore {
  toasts: Toast[];
  add: (type: ToastType, message: string, title?: string) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (type, message, title) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message, title }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string, title?: string) => useToastStore.getState().add('success', message, title),
  error: (message: string, title?: string) => useToastStore.getState().add('error', message, title),
  warning: (message: string, title?: string) => useToastStore.getState().add('warning', message, title),
  info: (message: string, title?: string) => useToastStore.getState().add('info', message, title),
};
