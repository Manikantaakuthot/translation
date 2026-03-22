'use strict';

/**
 * Voice Translator Client Application.
 * Manages WebSocket connection, AudioWorklet mic capture, and audio playback.
 */

// ──── State ────
let ws = null;
let audioContext = null;
let workletNode = null;
let micStream = null;
let isConnected = false;
let isInCall = false;
let sessionId = null;
let userId = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimer = null;
let hearOriginal = false;

// Audio playback queue
const audioQueue = [];
let isPlaying = false;

// ──── DOM Elements ────
const consentModal = document.getElementById('consent-modal');
const consentAccept = document.getElementById('consent-accept');
const consentDecline = document.getElementById('consent-decline');
const mainUI = document.getElementById('main-ui');
const textOnlyBanner = document.getElementById('text-only-banner');
const langA = document.getElementById('lang-a');
const langB = document.getElementById('lang-b');
const startCallBtn = document.getElementById('start-call');
const endCallBtn = document.getElementById('end-call');
const toggleCaptionsBtn = document.getElementById('toggle-captions');
const hearOriginalToggle = document.getElementById('hear-original');
const captionArea = document.getElementById('caption-area');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const latencyDisplay = document.getElementById('latency-display');

let captionsVisible = true;
let textOnlyMode = false;

// ──── GDPR Consent ────
consentAccept.addEventListener('click', () => {
  consentModal.style.display = 'none';
  mainUI.style.display = 'block';
  // Log consent timestamp in-memory only (not persisted)
  console.log('[consent] Accepted at', new Date().toISOString());
});

consentDecline.addEventListener('click', () => {
  consentModal.style.display = 'none';
  mainUI.style.display = 'block';
  textOnlyMode = true;
  textOnlyBanner.style.display = 'block';
  startCallBtn.textContent = 'Start Text-Only Call';
  console.log('[consent] Declined — text-only mode');
});

// ──── WebSocket Connection ────
function getWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/audio`;
}

function connectWebSocket() {
  if (ws && ws.readyState <= 1) return; // Already open or connecting

  setStatus('connecting', 'Connecting...');

  ws = new WebSocket(getWsUrl());
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    isConnected = true;
    reconnectAttempts = 0;
    setStatus('connected', 'Connected');
    console.log('[ws] Connected');
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      // Binary: translated audio from server
      if (!textOnlyMode) {
        handleAudioData(event.data);
      }
      return;
    }

    // JSON control message
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error('[ws] Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    isConnected = false;
    setStatus('disconnected', 'Disconnected');

    if (isInCall && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 16000);
      setStatus('reconnecting', `Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      addCaption('system', 'Connection lost — reconnecting...');
      reconnectTimer = setTimeout(() => {
        connectWebSocket();
        // Re-join after reconnect
        if (ws.readyState === 1) {
          joinSession();
        }
      }, delay);
    }
  };

  ws.onerror = (err) => {
    console.error('[ws] Error:', err);
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'ready':
      setStatus('connected', 'In Call');
      addCaption('system', 'Call connected — speak to translate');
      break;

    case 'caption':
      addCaption(msg.speaker, msg.text);
      break;

    case 'error':
      addCaption('system', `Error: ${msg.message}`);
      if (msg.message.includes('not supported')) {
        addCaption('system', 'Switching to captions-only mode');
      }
      break;

    case 'latency':
      latencyDisplay.textContent = `${msg.ms}ms`;
      break;

    default:
      console.log('[ws] Unknown message:', msg);
  }
}

// ──── Audio Playback ────
function handleAudioData(arrayBuffer) {
  if (hearOriginal) return; // Skip translated audio in "hear original" mode

  audioQueue.push(arrayBuffer);
  if (!isPlaying) {
    playNextInQueue();
  }
}

async function playNextInQueue() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const data = audioQueue.shift();

  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Server sends MP3 audio (from ElevenLabs/OpenAI TTS)
    // Use Web Audio API's decodeAudioData to handle any format
    const audioBuffer = await audioContext.decodeAudioData(data.slice(0));

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => playNextInQueue();
    source.start();
  } catch (e) {
    console.error('[audio] Playback error:', e);
    isPlaying = false;
    playNextInQueue(); // Try next
  }
}

// ──── Mic Capture via AudioWorklet ────
async function startMicCapture() {
  if (textOnlyMode) return;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    audioContext = new AudioContext({ sampleRate: 48000 });

    // Load AudioWorklet processor
    await audioContext.audioWorklet.addModule('audio-worklet-processor.js');

    const source = audioContext.createMediaStreamSource(micStream);
    workletNode = new AudioWorkletNode(audioContext, 'mic-processor');

    // Receive 40ms frames from AudioWorklet
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'audio-frame' && ws && ws.readyState === 1) {
        // Send Float32 PCM directly as binary over WebSocket
        const frame = new Float32Array(event.data.frame);
        ws.send(frame.buffer);
      }
    };

    source.connect(workletNode);
    // Do NOT connect to destination — we don't want to hear our own mic
    workletNode.connect(audioContext.destination); // Needed to keep processor alive
    // Actually, connect to a GainNode with gain=0 to keep alive without hearing
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    source.disconnect();
    source.connect(workletNode);
    workletNode.disconnect();
    workletNode.connect(silentGain);
    silentGain.connect(audioContext.destination);

    console.log('[mic] AudioWorklet capture started');
  } catch (e) {
    console.error('[mic] Failed to start capture:', e);
    addCaption('system', 'Microphone access denied — text-only mode');
    textOnlyMode = true;
  }
}

function stopMicCapture() {
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}

// ──── Session Management ────
function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function joinSession() {
  if (!ws || ws.readyState !== 1) return;

  ws.send(JSON.stringify({
    type: 'join',
    sessionId,
    userId,
    sourceLang: langA.value,
    targetLang: langB.value,
  }));
}

// ──── Call Controls ────
startCallBtn.addEventListener('click', async () => {
  sessionId = generateId();
  userId = generateId().split('-')[0]; // Short user ID

  // Show session ID for partner to join
  const shareUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
  addCaption('system', `Session created. Share this link: ${shareUrl}`);

  connectWebSocket();

  // Wait for connection then join
  const waitForOpen = () => new Promise((resolve) => {
    if (ws.readyState === 1) return resolve();
    ws.addEventListener('open', resolve, { once: true });
  });

  await waitForOpen();
  joinSession();
  await startMicCapture();

  isInCall = true;
  startCallBtn.disabled = true;
  endCallBtn.disabled = false;
  langA.disabled = false;
  langB.disabled = false;
});

endCallBtn.addEventListener('click', () => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'leave', sessionId, userId }));
  }

  stopMicCapture();
  isInCall = false;
  startCallBtn.disabled = false;
  endCallBtn.disabled = true;
  setStatus('disconnected', 'Call ended');
  addCaption('system', 'Call ended');

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }
});

// Mid-call language change
langA.addEventListener('change', () => {
  if (ws && ws.readyState === 1 && isInCall) {
    ws.send(JSON.stringify({
      type: 'lang',
      sourceLang: langA.value,
      targetLang: langB.value,
    }));
    addCaption('system', `Language changed: ${langA.options[langA.selectedIndex].text} → ${langB.options[langB.selectedIndex].text}`);
  }
});

langB.addEventListener('change', () => {
  if (ws && ws.readyState === 1 && isInCall) {
    ws.send(JSON.stringify({
      type: 'lang',
      sourceLang: langA.value,
      targetLang: langB.value,
    }));
    addCaption('system', `Language changed: ${langA.options[langA.selectedIndex].text} → ${langB.options[langB.selectedIndex].text}`);
  }
});

// Toggle captions
toggleCaptionsBtn.addEventListener('click', () => {
  captionsVisible = !captionsVisible;
  captionArea.style.display = captionsVisible ? 'block' : 'none';
  toggleCaptionsBtn.textContent = captionsVisible ? 'Hide Captions' : 'Show Captions';
});

// Hear original toggle
hearOriginalToggle.addEventListener('change', (e) => {
  hearOriginal = e.target.checked;
  addCaption('system', hearOriginal ? 'Playing original voice' : 'Playing translated voice');
});

// ──── UI Helpers ────
function addCaption(speaker, text) {
  if (!text) return;

  const entry = document.createElement('div');
  entry.className = `caption-entry caption-${speaker}`;

  const label = document.createElement('span');
  label.className = 'caption-label';
  label.textContent = speaker === 'system' ? '[System]' : `[Speaker ${speaker}]`;

  const content = document.createElement('span');
  content.className = 'caption-text';
  content.textContent = text;

  entry.appendChild(label);
  entry.appendChild(content);
  captionArea.appendChild(entry);
  captionArea.scrollTop = captionArea.scrollHeight;
}

function setStatus(state, text) {
  statusIndicator.className = `status-dot status-${state}`;
  statusText.textContent = text;
}

// ──── Auto-join from URL ────
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const existingSession = params.get('session');

  if (existingSession) {
    // Auto-join existing session after consent
    const joinExisting = async () => {
      sessionId = existingSession;
      userId = generateId().split('-')[0];

      connectWebSocket();
      const waitForOpen = () => new Promise((resolve) => {
        if (ws.readyState === 1) return resolve();
        ws.addEventListener('open', resolve, { once: true });
      });

      await waitForOpen();
      joinSession();
      await startMicCapture();

      isInCall = true;
      startCallBtn.disabled = true;
      endCallBtn.disabled = false;
      addCaption('system', 'Joined existing session');
    };

    // Hook into consent accept to auto-join
    consentAccept.addEventListener('click', () => setTimeout(joinExisting, 100), { once: true });
  }
});
