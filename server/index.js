'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { AudioBufferManager, FRAME_SIZE } = require('./vad');
const { translateAudio } = require('./pipeline');

const PORT = parseInt(process.env.PORT, 10) || 3000;

// ──── Express Setup ────
const app = express();
app.use(express.json());

// Serve client files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Health check — returns 200 OK, NEVER returns session data
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// ICE server config endpoint (STUN/TURN)
app.get('/api/ice-servers', (_req, res) => {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Add TURN server if configured
  if (process.env.TURN_SERVER_URL) {
    servers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }

  res.json({ iceServers: servers });
});

// ──── HTTP Server ────
const server = http.createServer(app);

// ──── Session Management ────
// Map of sessionId → { users: Map<userId, { ws, sourceLang, targetLang, bufferManager }> }
const sessions = new Map();

/**
 * Clean up a session and all associated resources.
 * Privacy: all session data deleted immediately.
 */
function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  for (const [, user] of session.users) {
    if (user.bufferManager) {
      user.bufferManager.destroy();
    }
  }
  sessions.delete(sessionId);
  console.log(`[session] Destroyed session ${sessionId}`);
}

/**
 * Remove a user from their session. Destroy session if empty.
 */
function removeUser(sessionId, userId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const user = session.users.get(userId);
  if (user) {
    if (user.bufferManager) {
      user.bufferManager.forceFlush();
      user.bufferManager.destroy();
    }
    session.users.delete(userId);
  }

  if (session.users.size === 0) {
    destroySession(sessionId);
  }
}

/**
 * Get the partner user in a session (for 2-person calls).
 */
function getPartner(sessionId, userId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  for (const [id, user] of session.users) {
    if (id !== userId) return user;
  }
  return null;
}

/**
 * Send a JSON message to a WebSocket client safely.
 */
function sendJSON(ws, data) {
  if (ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(data));
  }
}

/**
 * Send binary audio data to a WebSocket client safely.
 */
function sendBinary(ws, buffer) {
  if (ws.readyState === 1) {
    ws.send(buffer, { binary: true });
  }
}

// ──── WebSocket Server on /audio ────
const wss = new WebSocketServer({ server, path: '/audio' });

wss.on('connection', (ws) => {
  let currentSessionId = null;
  let currentUserId = null;

  ws.on('message', (data, isBinary) => {
    // ──── Binary: raw PCM audio frames ────
    if (isBinary) {
      if (!currentSessionId || !currentUserId) return;

      const session = sessions.get(currentSessionId);
      if (!session) return;

      const user = session.users.get(currentUserId);
      if (!user || !user.bufferManager) return;

      // Convert raw bytes to Float32Array (client sends Float32)
      const float32 = new Float32Array(
        data.buffer, data.byteOffset, data.byteLength / 4
      );

      // Feed frames to VAD buffer manager
      // AudioWorklet sends 40ms chunks = 640 samples at 16kHz
      for (let i = 0; i < float32.length; i += FRAME_SIZE) {
        const end = Math.min(i + FRAME_SIZE, float32.length);
        const frame = float32.slice(i, end);
        user.bufferManager.appendFrame(frame);
      }

      return;
    }

    // ──── JSON: control messages ────
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      sendJSON(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'join': {
        const { sessionId, userId, sourceLang, targetLang } = msg;
        if (!sessionId || !userId) {
          sendJSON(ws, { type: 'error', message: 'Missing sessionId or userId' });
          return;
        }

        currentSessionId = sessionId;
        currentUserId = userId;

        // Create session if needed
        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, { users: new Map() });
        }

        const session = sessions.get(sessionId);

        // Check max 2 users per session
        if (session.users.size >= 2 && !session.users.has(userId)) {
          sendJSON(ws, { type: 'error', message: 'Session is full (max 2 users)' });
          return;
        }

        // Create audio buffer manager for this user
        // On flush: run the translation pipeline and send results to partner
        const bufferManager = new AudioBufferManager(async (audioBuffer) => {
          const partner = getPartner(sessionId, userId);
          if (!partner) return; // No partner yet

          const targetLangCurrent = partner.targetLang || targetLang || 'en';
          const sourceLangCurrent = session.users.get(userId)?.sourceLang || sourceLang || 'auto';

          try {
            const result = await translateAudio(audioBuffer, sourceLangCurrent, targetLangCurrent);

            // Send caption to partner
            if (result.translation) {
              sendJSON(partner.ws, {
                type: 'caption',
                text: result.translation,
                speaker: userId === 'A' ? 'A' : 'B',
              });
            }

            // Send translated audio to partner
            if (result.audioBuffer && result.audioBuffer.length > 0) {
              sendBinary(partner.ws, result.audioBuffer);
            }

            // Send latency report to both users
            sendJSON(ws, { type: 'latency', ms: result.latencyMs });
            sendJSON(partner.ws, { type: 'latency', ms: result.latencyMs });
          } catch (pipelineError) {
            console.error('[pipeline] Unhandled error:', pipelineError.message);
            if (partner) {
              sendJSON(partner.ws, {
                type: 'caption',
                text: '[Translation error]',
                speaker: userId === 'A' ? 'A' : 'B',
              });
            }
          }

          // Privacy: audioBuffer goes out of scope here — no references kept
        });

        session.users.set(userId, {
          ws,
          sourceLang: sourceLang || 'auto',
          targetLang: targetLang || 'en',
          bufferManager,
        });

        sendJSON(ws, { type: 'ready' });

        // Notify partner that someone joined
        const partner = getPartner(sessionId, userId);
        if (partner) {
          sendJSON(partner.ws, { type: 'ready' });
        }

        // Log only metadata
        console.log(`[session] User ${userId} joined session ${sessionId} (${sourceLang} → ${targetLang})`);
        break;
      }

      case 'lang': {
        // Mid-call language change
        if (!currentSessionId || !currentUserId) return;

        const session = sessions.get(currentSessionId);
        if (!session) return;

        const user = session.users.get(currentUserId);
        if (!user) return;

        if (msg.sourceLang) user.sourceLang = msg.sourceLang;
        if (msg.targetLang) user.targetLang = msg.targetLang;

        console.log(`[session] User ${currentUserId} changed lang: ${msg.sourceLang} → ${msg.targetLang}`);
        break;
      }

      case 'leave': {
        if (currentSessionId && currentUserId) {
          const partner = getPartner(currentSessionId, currentUserId);
          removeUser(currentSessionId, currentUserId);

          if (partner) {
            sendJSON(partner.ws, {
              type: 'error',
              message: 'Other user left the call',
            });
          }
        }
        currentSessionId = null;
        currentUserId = null;
        break;
      }

      default:
        sendJSON(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    if (currentSessionId && currentUserId) {
      const partner = getPartner(currentSessionId, currentUserId);
      removeUser(currentSessionId, currentUserId);

      if (partner) {
        sendJSON(partner.ws, {
          type: 'error',
          message: 'Connection lost — other user disconnected',
        });
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[ws] WebSocket error:', err.message);
  });
});

// ──── Start Server ────
server.listen(PORT, () => {
  console.log(`[server] Voice translator running on http://localhost:${PORT}`);
  console.log(`[server] WebSocket endpoint: ws://localhost:${PORT}/audio`);
  console.log(`[server] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown — destroy all sessions
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  for (const [sessionId] of sessions) {
    destroySession(sessionId);
  }
  wss.close();
  server.close();
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received, shutting down...');
  for (const [sessionId] of sessions) {
    destroySession(sessionId);
  }
  wss.close();
  server.close();
  process.exit(0);
});

module.exports = { app, server, wss, sessions, destroySession };
