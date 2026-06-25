import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';

let globalSocket: Socket | null = null;

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(globalSocket);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    if (!globalSocket) {
      const token = getAccessToken();
      globalSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
        auth: { token },
        transports: ['websocket'],
      });

      globalSocket.on('connect', () => {
        console.log('Socket connected', globalSocket?.id);
      });

      globalSocket.on('disconnect', () => {
        console.log('Socket disconnected');
      });
    }

    setSocket(globalSocket);

    return () => {
      // We keep the socket alive during the session, so no cleanup here
    };
  }, [user]);

  return socket;
}
