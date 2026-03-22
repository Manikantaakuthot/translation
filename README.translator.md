# Real-Time Voice Translator

A live, bidirectional voice translation system for the web browser with a Node.js backend. Two users speak in different languages and hear each other translated in real time.

## Architecture

```
[Browser A - Mic]
     │  AudioWorklet captures 40ms PCM frames at 16kHz
     ▼
[WebSocket → Node.js Server]
     │  VAD buffers → flushes on 300ms silence or 1.5s max
     ▼
[STT: OpenAI Whisper] → [MT: DeepL] → [TTS: Azure Neural]
     │
     ▼
[WebSocket → Browser B - Speaker]
     Plays translated audio via Web Audio API

Both directions run simultaneously as parallel async pipelines.
```

**Fallback pipeline:** Google Cloud STT → Azure Translator → Google WaveNet TTS

## Prerequisites

- Node.js 20+
- API keys for: OpenAI, DeepL, Azure Speech Services
- (Optional) Google Cloud credentials for fallback pipeline
- (Optional) TURN server for NAT traversal

## Setup

### 1. Install dependencies

```bash
# From the project root
npm install express ws uuid dotenv openai axios \
  @google-cloud/speech @google-cloud/text-to-speech \
  microsoft-cognitiveservices-speech-sdk

# Dev dependencies
npm install -D jest
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your API keys:

| Variable | Source | Required |
|----------|--------|----------|
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/api-keys) | Yes |
| `DEEPL_API_KEY` | [DeepL API](https://www.deepl.com/pro-api) | Yes |
| `AZURE_SPEECH_KEY` | [Azure Portal](https://portal.azure.com) → Speech Service | Yes |
| `AZURE_SPEECH_REGION` | Same Azure resource (e.g. `eastus`) | Yes |
| `GOOGLE_CLOUD_CREDENTIALS_PATH` | [GCP Console](https://console.cloud.google.com/apis/credentials) | No (fallback only) |
| `TURN_SERVER_URL` | Self-hosted coturn or [Twilio NTS](https://www.twilio.com/docs/stun-turn) | No |
| `TURN_USERNAME` | TURN server credentials | No |
| `TURN_CREDENTIAL` | TURN server credentials | No |
| `PORT` | Server port (default: 3000) | No |

### 3. Run locally

```bash
node server/index.js
```

Open `http://localhost:3000` in your browser.

### 4. Run with Docker

```bash
docker build -f Dockerfile.translator -t voice-translator .
docker run -p 3000:3000 --env-file server/.env voice-translator
```

### 5. Run tests

```bash
npx jest tests/ --forceExit --detectOpenHandles
```

## How to Use

1. Open the app in a browser
2. Accept the GDPR consent prompt
3. Select your language and your partner's language
4. Click "Start Call" — a shareable link is generated
5. Share the link with your partner — they open it and auto-join
6. Speak — your partner hears the translation in real time
7. Toggle "Hear Original Voice" to hear untranslated audio
8. Toggle captions to see live transcription

## Latency Tuning

Target: < 500ms round-trip (aim for 300ms)

| Optimization | Impact |
|-------------|--------|
| AudioWorklet (not ScriptProcessor) | Saves ~50ms |
| 40ms audio frames (not 100ms+) | Saves ~60ms |
| VAD silence detection (300ms) | Reduces unnecessary API calls |
| Azure TTS streaming | First audio chunk arrives ~100ms before full synthesis |
| Async pipeline with parallel buffering | Next utterance buffers while current translates |

**Tips:**
- Choose Azure regions close to your users
- Use Whisper `whisper-1` (fastest model)
- DeepL API typically responds in 50-100ms
- Azure Neural TTS streaming starts sending audio within 200ms
- Keep audio at 16kHz mono — higher sample rates add no value for speech

## Cost Estimate (1 Hour of Active Translated Calls)

Assumptions: 50% of the time one person is speaking, ~150 words/min, ~2 utterances/min per speaker.

| Service | Usage/Hour | Cost |
|---------|-----------|------|
| OpenAI Whisper | ~30 min audio | ~$0.18 |
| DeepL API | ~9,000 words (~45K chars) | ~$0.90 (Pro) |
| Azure Neural TTS | ~45K chars | ~$0.72 |
| **Total** | | **~$1.80/hour** |

Costs double for bidirectional (both speakers active): ~$3.60/hour.

## Supported Languages

| Language | Code | Azure Voice |
|----------|------|-------------|
| English | en | en-US-JennyNeural |
| Spanish | es | es-ES-ElviraNeural |
| French | fr | fr-FR-DeniseNeural |
| German | de | de-DE-KatjaNeural |
| Hindi | hi | hi-IN-SwaraNeural |
| Chinese | zh | zh-CN-XiaoxiaoNeural |
| Japanese | ja | ja-JP-NanamiNeural |
| Arabic | ar | ar-SA-ZariyahNeural |
| Portuguese | pt | pt-BR-FranciscaNeural |
| Russian | ru | ru-RU-SvetlanaNeural |
| Telugu | te | te-IN-ShrutiNeural |
| Tamil | ta | ta-IN-PallaviNeural |
| Korean | ko | ko-KR-SunHiNeural |

## WebSocket Protocol

### Client → Server

```json
{ "type": "join",  "sessionId": "...", "userId": "...", "sourceLang": "en", "targetLang": "es" }
{ "type": "lang",  "sourceLang": "en", "targetLang": "fr" }
{ "type": "leave", "sessionId": "...", "userId": "..." }
```

Binary: raw Float32 PCM audio bytes (40ms frames at 16kHz)

### Server → Client

```json
{ "type": "ready" }
{ "type": "caption", "text": "Hola mundo", "speaker": "A" }
{ "type": "error",   "message": "..." }
{ "type": "latency", "ms": 287 }
```

Binary: translated PCM audio bytes (16-bit 16kHz mono)

## Privacy

- All audio processed in-memory only — **never written to disk**
- No transcripts stored in any database
- Ephemeral session IDs (UUID v4, expire on call end)
- All connections use WSS (TLS) for production
- GDPR consent required before microphone access
- Transcript text is never logged — only metadata (language pair, duration)

## Known Limitations

1. **Max 2 users per session** — this is a 1:1 call system. Conference calls would require mixing audio streams.
2. **No WebRTC peer-to-peer** — all audio routes through the server for translation. This adds latency but is required for the AI pipeline.
3. **Whisper is not truly streaming** — audio is buffered (up to 1.5s) before sending to Whisper. True word-level streaming would require a different STT provider.
4. **DeepL language coverage** — some languages (e.g. Telugu, Tamil) may not be supported by DeepL. The system falls back to Azure Translator automatically.
5. **Cold start latency** — first translation may take 1-2s while API connections warm up. Subsequent translations are faster.
6. **No speaker diarization** — the system assumes one speaker per direction. Crosstalk may produce garbled translations.

## Extending the System

- **Add more languages:** Update `VOICE_MAP` in `server/tts.js` and language options in `client/index.html`
- **Add conference calls:** Implement audio mixing and per-user language routing in `server/index.js`
- **Add streaming STT:** Replace Whisper with Deepgram or AssemblyAI for word-level streaming
- **Add recording (opt-in):** Store encrypted audio in Vercel Blob with user consent
- **Add WebRTC data channel:** Use for low-latency caption delivery instead of WebSocket
- **Add voice cloning:** Use Azure Custom Neural Voice to match the speaker's voice in translation
