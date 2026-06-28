import { create } from 'zustand';
import type { AiActionProposal } from '@/types';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  proposal?: AiActionProposal;
}

const GREETING: AiMessage = {
  role: 'assistant',
  content:
    "Hello! I'm your AI workflow assistant. How can I help you today? I can help you find jobs at risk, assign designers, or analyze your workload.",
};

interface AiState {
  messages: AiMessage[];
  input: string;
  loading: boolean;
  isOpen: boolean;
  addMessage: (msg: AiMessage) => void;
  setInput: (v: string) => void;
  setLoading: (v: boolean) => void;
  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  clear: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  messages: [GREETING],
  input: '',
  loading: false,
  isOpen: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setInput: (v) => set({ input: v }),
  setLoading: (v) => set({ loading: v }),
  setOpen: (v) => set({ isOpen: v }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  clear: () => set({ messages: [GREETING], input: '', loading: false, isOpen: false }),
}));
