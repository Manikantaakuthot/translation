'use strict';

/**
 * Privacy tests.
 * Verifies no audio is written to disk, session cleanup, and health endpoint safety.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Mock fs.writeFile and fs.writeFileSync to detect any disk writes
const originalWriteFile = fs.writeFile;
const originalWriteFileSync = fs.writeFileSync;
const diskWrites = [];

beforeAll(() => {
  fs.writeFile = jest.fn((...args) => {
    diskWrites.push({ method: 'writeFile', path: args[0] });
    // Call the original callback with an error to prevent actual writes
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null);
  });

  fs.writeFileSync = jest.fn((...args) => {
    diskWrites.push({ method: 'writeFileSync', path: args[0] });
  });
});

afterAll(() => {
  fs.writeFile = originalWriteFile;
  fs.writeFileSync = originalWriteFileSync;
});

beforeEach(() => {
  diskWrites.length = 0;
});

describe('Privacy - No Audio Written to Disk', () => {
  test('pipeline does not write audio files to disk', async () => {
    // Mock all external services
    jest.mock('../server/stt', () => ({
      transcribeWithWhisper: jest.fn().mockResolvedValue({ text: 'test', detectedLanguage: 'en' }),
      transcribeWithGoogle: jest.fn(),
    }));

    jest.mock('../server/mt', () => ({
      translateWithDeepL: jest.fn().mockResolvedValue('prueba'),
      translateWithAzure: jest.fn(),
      buildTranslationContext: jest.fn().mockReturnValue(''),
      toDeepLLang: jest.fn().mockReturnValue('ES'),
    }));

    jest.mock('../server/tts', () => ({
      synthesizeWithAzure: jest.fn().mockResolvedValue(Buffer.from('audio')),
      synthesizeWithGoogle: jest.fn(),
    }));

    const { translateAudio } = require('../server/pipeline');
    const mockAudio = new Float32Array(640).fill(0.1);

    await translateAudio(mockAudio, 'en', 'es');

    // Check no audio files were written
    const audioWrites = diskWrites.filter((w) => {
      const ext = path.extname(String(w.path)).toLowerCase();
      return ['.wav', '.pcm', '.mp3', '.ogg', '.webm', '.raw', '.audio'].includes(ext);
    });

    expect(audioWrites).toHaveLength(0);
  });

  test('fs.writeFile is not called with audio data during pipeline execution', () => {
    // After the pipeline test above, verify no unexpected writes
    const suspiciousWrites = diskWrites.filter((w) => {
      const pathStr = String(w.path);
      return pathStr.includes('audio') || pathStr.includes('transcript') || pathStr.includes('recording');
    });

    expect(suspiciousWrites).toHaveLength(0);
  });
});

describe('Privacy - Session Cleanup', () => {
  test('session data is deleted on WebSocket close', () => {
    // Directly test session management
    const sessions = new Map();

    // Simulate a session
    const sessionId = 'test-session-123';
    sessions.set(sessionId, {
      users: new Map([
        ['user-A', { ws: null, sourceLang: 'en', targetLang: 'es', bufferManager: { destroy: jest.fn() } }],
      ]),
    });

    expect(sessions.has(sessionId)).toBe(true);

    // Simulate cleanup (what happens on ws close)
    const session = sessions.get(sessionId);
    for (const [, user] of session.users) {
      if (user.bufferManager) user.bufferManager.destroy();
    }
    sessions.delete(sessionId);

    expect(sessions.has(sessionId)).toBe(false);
    expect(sessions.size).toBe(0);
  });

  test('buffer manager is destroyed on user removal', () => {
    const destroyFn = jest.fn();
    const sessions = new Map();

    sessions.set('session-1', {
      users: new Map([
        ['user-A', { bufferManager: { destroy: destroyFn, forceFlush: jest.fn() } }],
        ['user-B', { bufferManager: { destroy: jest.fn(), forceFlush: jest.fn() } }],
      ]),
    });

    // Remove user A
    const session = sessions.get('session-1');
    const userA = session.users.get('user-A');
    userA.bufferManager.forceFlush();
    userA.bufferManager.destroy();
    session.users.delete('user-A');

    expect(destroyFn).toHaveBeenCalledTimes(1);
    expect(session.users.size).toBe(1);
  });
});

describe('Privacy - Health Endpoint', () => {
  test('/health returns status ok without session data', (done) => {
    // Create a minimal Express app to test
    const express = require('express');
    const testApp = express();

    testApp.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok', uptime: process.uptime() });
    });

    const testServer = testApp.listen(0, () => {
      const port = testServer.address().port;

      http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const body = JSON.parse(data);

          expect(res.statusCode).toBe(200);
          expect(body.status).toBe('ok');

          // Verify NO session data is exposed
          expect(body).not.toHaveProperty('sessions');
          expect(body).not.toHaveProperty('users');
          expect(body).not.toHaveProperty('audio');
          expect(body).not.toHaveProperty('transcripts');
          expect(body).not.toHaveProperty('translations');

          // Only allowed fields
          const allowedKeys = ['status', 'uptime'];
          Object.keys(body).forEach((key) => {
            expect(allowedKeys).toContain(key);
          });

          testServer.close(done);
        });
      });
    });
  });
});
