# Real-Time Voice Translation Architecture

This document captures the production pattern used for low-latency two-user voice translation with user-selected target language during calls.

## External reference patterns used

- OpenAI Realtime WebRTC pattern:
  - Browser audio over WebRTC
  - Stateful streaming events for turn detection, transcript deltas, and response audio
  - Reference: https://developers.openai.com/docs/guides/realtime-webrtc
- OpenAI one-way live translation pattern:
  - Audio fan-out + per-target translation sessions
  - Reference: https://developers.openai.com/cookbook/examples/voice_solutions/one_way_translation_using_realtime_api/
- Cloudflare real-time voice architecture principles:
  - Edge-first low-latency pipeline
  - Strict latency budget and streaming stages STT -> LLM/MT -> TTS
  - Reference: https://blog.cloudflare.com/cloudflare-realtime-voice-ai
- xAI voice API public model:
  - Bi-directional real-time audio sessions
  - Turn-taking and streaming responses
  - Reference: https://docs.x.ai/docs/guides/voice

## Core architecture in this repository

### Signaling and call media

- Peer-to-peer call media is handled with WebRTC (`simple-peer`) in `apps/web/src/components/call/CallScreen.tsx`.
- Signaling and call control events use Socket.IO via `apps/api/src/events/events.gateway.ts`.

### Translation pipeline

- STT input:
  - Primary path in this codebase is server-side streaming STT started by `call:start-whisper-stt` and fed by `call:audio-chunk`.
  - The gateway can also use ElevenLabs STT sessions as fallback.
- Translation:
  - `TranslationService.translateText(...)` in `apps/api/src/translation/translation.service.ts`.
- TTS:
  - `TranslationService.textToSpeech(...)` with provider fallback:
    1. Sarvam (Indian languages)
    2. ElevenLabs
    3. Google TTS
- Delivery:
  - API emits `call:translated-text` to the receiving user room with translated text and optional audio base64 payload.

## Language routing rule (critical requirement)

For every speech segment, the target language must come from the listener (receiver) preference for this call, not the speaker preference.

- Key used in memory map: `${callId}:${receiverUserId}`
- Runtime fallback: receiver `preferredLanguage` from DB

This guarantees each user hears the other participant translated into their own currently selected language.

## Disturbance prevention strategy

- Acoustic echo and cross-talk reduction:
  - Browser capture uses `echoCancellation`, `noiseSuppression`, `autoGainControl`.
  - STT is paused while translated TTS audio plays and resumed when queue drains.
- Audio UX de-conflict:
  - When translation is ON, raw remote call audio is muted to prevent hearing original + translated speech simultaneously.
- Backpressure and freshness:
  - TTS queue is capped (`MAX_AUDIO_QUEUE_SIZE`) to avoid long lag buildup.
  - Older queued clips are dropped first so latest translation stays relevant.

## Runtime event flow (speaker mode)

1. User A speaks in call.
2. Browser streams audio chunks to server (`call:audio-chunk`).
3. Server STT produces transcript fragments.
4. Server resolves receiver language for User B (`${callId}:${userB}`).
5. Server translates transcript to User B language.
6. Server generates TTS audio in User B language.
7. Server emits `call:translated-text` to User B.
8. User B client plays translated audio and keeps STT echo-safe via pause/resume.

## Recommended production hardening

- Use TURN relays in all regions where direct P2P fails.
- Keep STT chunk and silence thresholds tuned per network profile.
- Add metrics:
  - STT latency
  - Translation latency
  - TTS latency
  - End-to-end time-to-first-audio
- Add adaptive degradation:
  - text-only translation on TTS failures
  - engine fallback on quota/rate-limit events
- Add integration tests for:
  - mid-call language changes
  - bi-directional simultaneous speech
  - reconnect and socket resume behavior
