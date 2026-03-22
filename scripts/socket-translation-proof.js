const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

const USER_1 = { phone: '9000001001', password: 'Test@1234' };
const USER_2 = { phone: '9000001002', password: 'Test@1234' };

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function connectSocket(token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 10000,
    });
    socket.on('connect', () => {
      console.log(`[${label}] connected`, socket.id);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      reject(new Error(`[${label}] connect_error: ${err.message}`));
    });
  });
}

async function main() {
  let socket1;
  let socket2;
  let callId;

  try {
    const login1 = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(USER_1),
    });
    const login2 = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(USER_2),
    });

    console.log('login1 user:', login1.user?.id, login1.user?.name);
    console.log('login2 user:', login2.user?.id, login2.user?.name);

    const initiate = await api('/calls/initiate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login1.accessToken}` },
      body: JSON.stringify({ calleeId: login2.user.id, type: 'voice' }),
    });
    callId = initiate.id;
    console.log('call initiated:', callId);

    await api(`/calls/${callId}/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${login2.accessToken}` },
      body: JSON.stringify({}),
    });
    console.log('call answered');

    socket1 = await connectSocket(login1.accessToken, 'user1');
    socket2 = await connectSocket(login2.accessToken, 'user2');

    const translatedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for call:translated-text'));
      }, 15000);

      socket2.on('call:translated-text', (payload) => {
        if (payload?.callId === callId) {
          clearTimeout(timeout);
          resolve(payload);
        }
      });
    });

    // Set speaker's preferred target language for this call.
    socket1.emit('call:update-language', { callId, language: 'kn' });
    await new Promise((r) => setTimeout(r, 500));

    socket1.emit('call:speech', {
      callId,
      text: 'Hello my friend, this is a realtime translation proof run.',
    });
    console.log('sent call:speech from user1');

    const translated = await translatedPromise;
    console.log('\n=== TRANSLATION OUTPUT ===');
    console.log(JSON.stringify(translated, null, 2));
  } finally {
    if (socket1) socket1.disconnect();
    if (socket2) socket2.disconnect();
    if (callId) {
      try {
        await api(`/calls/${callId}/end`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});
