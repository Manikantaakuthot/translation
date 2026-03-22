import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3000';

let sharedSocket: Socket | null = null;
let connectCount = 0;

export function useSocket(accessToken: string | null) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      if (sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
      }
      setConnected(false);
      return;
    }

    // Reuse the same socket across hook instances (global singleton)
    if (!sharedSocket || !sharedSocket.connected) {
      if (sharedSocket) {
        sharedSocket.disconnect();
      }
      sharedSocket = io(SOCKET_URL, {
        auth: { token: accessToken },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
    }

    socketRef.current = sharedSocket;
    connectCount++;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    sharedSocket.on('connect', onConnect);
    sharedSocket.on('disconnect', onDisconnect);

    if (sharedSocket.connected) setConnected(true);

    return () => {
      connectCount--;
      sharedSocket?.off('connect', onConnect);
      sharedSocket?.off('disconnect', onDisconnect);
      // Only fully disconnect when no more consumers
      if (connectCount === 0 && sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
        socketRef.current = null;
      }
    };
  }, [accessToken]);

  return { socket: socketRef.current, connected };
}
