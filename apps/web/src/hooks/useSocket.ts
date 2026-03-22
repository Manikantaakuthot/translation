import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

function getBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace('/api', '');
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  // In dev mode, use same origin so Vite proxy handles /socket.io (avoids mixed-content on HTTPS)
  if (import.meta.env.DEV) {
    const port = window.location.port;
    return port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`;
  }
  // For localhost production, connect directly to API on port 3000
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
  // For tunnels (trycloudflare.com, ngrok, etc.), use same origin
  if (host.includes('trycloudflare.com') || host.includes('ngrok') || host.includes('loca.lt')) {
    return `${protocol}//${host}`;
  }
  // For local network IPs, connect directly to API on port 3000
  return `http://${host}:3000`;
}
const SOCKET_URL = getBaseUrl();
const REFRESH_URL = `${SOCKET_URL}/api/auth/refresh`;

// Singleton socket — one connection per browser tab
let globalSocket: Socket | null = null;
let globalToken: string | null = null;
let refreshing = false;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Decode JWT payload without a library */
function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

/** Refresh the access token and update socket auth */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return null;
  refreshing = true;
  try {
    const refreshToken = sessionStorage.getItem('refreshToken');
    if (!refreshToken) return null;

    const { data } = await axios.post(REFRESH_URL, { refreshToken });
    sessionStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) sessionStorage.setItem('refreshToken', data.refreshToken);

    // Update socket auth
    if (globalSocket) {
      globalSocket.auth = { token: data.accessToken };
      globalToken = data.accessToken;
    }

    // Schedule next proactive refresh
    scheduleProactiveRefresh(data.accessToken);

    return data.accessToken;
  } catch {
    return null;
  } finally {
    refreshing = false;
  }
}

/** Schedule a token refresh before it expires (at 80% of its lifetime) */
function scheduleProactiveRefresh(token: string) {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }

  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;
  // Refresh at 80% of the token lifetime, minimum 10 seconds before expiry
  const refreshIn = Math.max((timeUntilExpiry * 0.8) * 1000, (timeUntilExpiry - 10) * 1000);

  if (refreshIn <= 0) {
    // Token already expired or about to, refresh now
    refreshAccessToken();
    return;
  }

  proactiveRefreshTimer = setTimeout(() => {
    refreshAccessToken();
  }, refreshIn);
}

function getOrCreateSocket(token: string): Socket {
  // Reuse existing socket if token hasn't changed (even if still connecting)
  if (globalSocket && globalToken === token) {
    if (!globalSocket.connected) {
      globalSocket.connect();
    }
    return globalSocket;
  }

  // If token changed but socket exists, update auth
  if (globalSocket && globalToken !== token) {
    globalSocket.auth = { token };
    globalToken = token;
    if (!globalSocket.connected) {
      globalSocket.connect();
    }
    scheduleProactiveRefresh(token);
    return globalSocket;
  }

  // Create new socket
  if (globalSocket) {
    globalSocket.disconnect();
  }

  // Use the passed-in token directly (tab-safe), not localStorage (shared across tabs)
  const currentToken = token;
  globalToken = currentToken;

  globalSocket = io(SOCKET_URL, {
    auth: { token: currentToken },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // On connect_error, refresh token if expired
  globalSocket.on('connect_error', async (err) => {
    console.error(`[Socket] Connection error: ${err.message}`);
    if (
      (err.message?.includes('jwt expired') || err.message?.includes('Unauthorized')) &&
      !refreshing
    ) {
      const newToken = await refreshAccessToken();
      if (newToken && globalSocket) {
        // Force reconnect with new token
        globalSocket.disconnect();
        globalSocket.connect();
      }
    }
  });

  // On successful connect, start proactive refresh cycle + log
  globalSocket.on('connect', () => {
    console.log(`[Socket] Connected, id: ${globalSocket?.id}`);
    scheduleProactiveRefresh(globalToken || currentToken);
  });

  // Initial schedule
  scheduleProactiveRefresh(currentToken);

  return globalSocket;
}

export function useSocket(token: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = getOrCreateSocket(token);
    setSocket(s);
    setConnected(s.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onAuth = () => setConnected(true);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('authenticated', onAuth);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('authenticated', onAuth);
      // Do NOT disconnect — singleton stays alive across component remounts
    };
  }, [token]);

  return { socket, connected };
}
