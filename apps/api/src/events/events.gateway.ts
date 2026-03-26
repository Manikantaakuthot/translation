import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Message, MessageDocument } from '../messages/schemas/message.schema';
import { Conversation, ConversationDocument } from '../conversations/schemas/conversation.schema';
import { Call, CallDocument } from '../calls/schemas/call.schema';
import { TranslationService } from '../translation/translation.service';
import { ElevenLabsService, SttSession } from '../translation/elevenlabs.service';
import { WhisperSttService } from '../translation/whisper-stt.service';

@WebSocketGateway({
  cors: { origin: true },
  namespace: '/',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  /**
   * Architecture: BlackBox-style ElevenLabs Conversational AI Agent
   *
   * PRIMARY path (new): Client → ElevenLabs Agent (WebRTC+AEC) → Custom LLM (TranslationAgentController)
   *   → Translation → TTS → Socket.IO (emitTranslatedText) → Other User
   *   Echo cancellation handled by WebRTC AEC — no manual prevention needed.
   *
   * FALLBACK path (legacy): Client → call:audio-chunk → ElevenLabs STT WebSocket
   *   → Translation → TTS → call:translated-text → Other User
   *   Uses manual echo prevention (cooldowns, script validation, etc.)
   */
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private sttSessions = new Map<string, SttSession>(); // `${userId}:${callId}` -> SttSession (legacy fallback)
  private ttsCooldowns = new Map<string, number>(); // userId -> timestamp of last TTS audio (legacy echo prevention)
  private lastTtsText = new Map<string, string>(); // userId -> last TTS text (legacy textual echo cancellation)
  private pausedSttSessions = new Set<string>(); // sessionKeys paused during TTS (legacy half-duplex)
  private callLanguages = new Map<string, string>(); // `${callId}:${userId}` → preferred language (in-memory, instant updates)
  private sttUtteranceBuffers = new Map<
    string,
    { text: string; firstAt: number; sourceLanguage?: string; flushTimer?: ReturnType<typeof setTimeout> }
  >(); // sessionKey -> buffered final transcript fragments (improves MT accuracy)
  private audioChunkLogAt = new Map<string, number>(); // sessionKey -> last sampled audio-chunk log timestamp

  /** Unicode script regex map for language validation */
  private static readonly SCRIPT_MAP: Record<string, RegExp> = {
    en: /\p{Script=Latin}/gu,
    hi: /\p{Script=Devanagari}/gu,
    te: /\p{Script=Telugu}/gu,
    ta: /\p{Script=Tamil}/gu,
    kn: /\p{Script=Kannada}/gu,
    ml: /\p{Script=Malayalam}/gu,
    bn: /\p{Script=Bengali}/gu,
    ar: /\p{Script=Arabic}/gu,
    ru: /\p{Script=Cyrillic}/gu,
    zh: /\p{Script=Han}/gu,
    ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu,
    ko: /\p{Script=Hangul}/gu,
    es: /\p{Script=Latin}/gu,
    fr: /\p{Script=Latin}/gu,
    de: /\p{Script=Latin}/gu,
    it: /\p{Script=Latin}/gu,
    pt: /\p{Script=Latin}/gu,
    tr: /\p{Script=Latin}/gu,
    vi: /\p{Script=Latin}/gu,
  };

  /** Check if transcript text uses expected Unicode scripts for the given languages */
  private isValidScript(text: string, expectedLanguages: string[]): boolean {
    const letters = text.replace(/[\s\p{P}\p{N}\p{S}]/gu, '');
    if (letters.length === 0) return true; // No letters = allow (numbers/punctuation only)

    // Always allow Latin script (English, numbers in transliteration, etc.)
    const latinMatches = letters.match(/\p{Script=Latin}/gu);
    if (latinMatches && latinMatches.length / letters.length > 0.5) return true;

    // Check if text matches any expected language's script
    for (const lang of expectedLanguages) {
      const regex = EventsGateway.SCRIPT_MAP[lang];
      if (regex) {
        const matches = letters.match(new RegExp(regex.source, regex.flags));
        if (matches && matches.length / letters.length > 0.3) return true;
      }
    }

    return false;
  }

  /** Check if two texts are similar (textual echo cancellation) */
  private isSimilarText(a: string, b: string): boolean {
    const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (wordsA.length === 0 || wordsB.length === 0) return false;
    let matches = 0;
    for (const word of wordsA) {
      if (wordsB.includes(word)) matches++;
    }
    return matches / Math.max(wordsA.length, 1) > 0.5;
  }

  /** Emit an event to a specific user via their room (joined on connect) */
  emitToUser(userId: string, event: string, data: any) {
    const socketCount = this.userSockets.get(userId)?.size || 0;
    this.server.to(`user:${userId}`).emit(event, data);
    console.log(`[Socket] Emitted ${event} to room user:${userId} (sockets: ${socketCount})`);
    if (event === 'call:translated-text') {
      console.log(
        `[voice_stage] translated_emit event=call:translated-text callId=${data?.callId} fromUserId=${data?.fromUserId} receiverUserId=${userId} targetLanguage=${data?.targetLanguage} audioBytes=${data?.audioBase64 ? Math.floor((data.audioBase64.length * 3) / 4) : 0}`,
      );
    }
  }

  constructor(
    private jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    private translationService: TranslationService,
    private elevenlabsService: ElevenLabsService,
    private whisperSttService: WhisperSttService,
  ) {}

  // Whisper STT audio accumulation buffers: sessionKey -> { chunks, timer }
  private whisperBuffers = new Map<
    string,
    { chunks: Buffer[]; totalBytes: number; timer?: ReturnType<typeof setTimeout>; language?: string; sttMode?: 'speaker' | 'listener' }
  >();

  afterInit(server: Server) {
    // Socket.io middleware: verify JWT before connection is established
    // This sends proper error to client as connect_error event
    server.use((socket: any, next: any) => {
      const token = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('No token provided'));
      }
      try {
        const payload = this.jwtService.verify(token);
        socket.userId = payload.sub;
        next();
      } catch (err) {
        console.log(`[Socket] Auth middleware rejected: ${err?.message}`);
        next(new Error(err?.message || 'Unauthorized'));
      }
    });
    console.log('[Socket] Gateway initialized with auth middleware');
  }

  async handleConnection(client: any) {
    const userId = client.userId;
    if (!userId) {
      client.disconnect();
      return;
    }
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    await this.userModel.updateOne({ _id: userId }, { isOnline: true, lastSeen: new Date() });
    client.join(`user:${userId}`);
    console.log(`[Socket] User ${userId} connected, socket ${client.id}, joined room user:${userId}`);
    client.emit('authenticated', { userId });
    this.server.emit('user:online', { userId });

    // Re-emit any pending (ringing) calls for this user that were created in the last 60 seconds
    try {
      const sixtySecondsAgo = new Date(Date.now() - 60_000);
      const pendingCalls = await this.callModel.find({
        calleeId: new Types.ObjectId(userId),
        status: 'ringing',
        createdAt: { $gte: sixtySecondsAgo },
      }).lean();

      for (const call of pendingCalls) {
        const caller = await this.userModel.findById((call as any).callerId).select('name').lean();
        client.emit('call:initiate', {
          callId: (call as any)._id.toString(),
          callerId: (call as any).callerId.toString(),
          callerName: (caller as any)?.name || 'Unknown',
          calleeId: userId,
          type: (call as any).type,
        });
        console.log(`[Socket] Re-emitted pending call ${(call as any)._id} to user ${userId}`);
      }

      // Auto-expire stale ringing calls older than 60 seconds
      await this.callModel.updateMany(
        {
          calleeId: new Types.ObjectId(userId),
          status: 'ringing',
          createdAt: { $lt: sixtySecondsAgo },
        },
        { status: 'missed' },
      );
    } catch (err) {
      console.error('[Socket] Error checking pending calls on connect:', err);
    }

    // Mark all undelivered messages as delivered for this user (offline catch-up)
    try {
      const userConvs = await this.conversationModel
        .find({ 'participants.userId': new Types.ObjectId(userId) })
        .select('_id')
        .lean();
      const convIds = userConvs.map((c: any) => c._id);

      if (convIds.length > 0) {
        const undelivered = await this.messageModel.find({
          conversationId: { $in: convIds },
          senderId: { $ne: new Types.ObjectId(userId) },
          'status.delivered.userId': { $ne: new Types.ObjectId(userId) },
          isDeleted: false,
        }).select('_id conversationId senderId').limit(200).lean();

        if (undelivered.length > 0) {
          await this.messageModel.updateMany(
            { _id: { $in: undelivered.map((m: any) => m._id) } },
            {
              $addToSet: {
                'status.delivered': {
                  userId: new Types.ObjectId(userId),
                  at: new Date(),
                },
              },
            },
          );
          console.log(`[Socket] Marked ${undelivered.length} messages as delivered for user ${userId}`);

          // Notify senders about delivery (so they see double tick)
          for (const msg of undelivered) {
            this.emitMessageDelivered(
              (msg as any)._id.toString(),
              userId,
              (msg as any).conversationId.toString(),
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[Socket] Error marking messages delivered on connect:', err);
    }
  }

  async handleDisconnect(client: any) {
    const userId = client.userId;
    if (userId) {
      // Close any active STT sessions for this user
      for (const [key, session] of this.sttSessions) {
        if (key.startsWith(`${userId}:`)) {
          session.close();
          this.sttSessions.delete(key);
        }
      }
      // Clean up speaker-mode Whisper buffers for this user
      for (const [key, buf] of this.whisperBuffers) {
        if (key.startsWith(`${userId}:`)) {
          if (buf.timer) clearTimeout(buf.timer);
          this.whisperBuffers.delete(key);
        }
      }
      // Clean up listener Whisper buffers for this user
      for (const [key, buf] of this.listenerWhisperBuffers) {
        if (key.includes(userId)) {
          if (buf.timer) clearTimeout(buf.timer);
          this.listenerWhisperBuffers.delete(key);
        }
      }
      // Clean up paused STT sessions for this user
      for (const key of this.pausedSttSessions) {
        if (key.includes(userId)) this.pausedSttSessions.delete(key);
      }
      // Clean up utterance buffers for this user
      for (const key of this.sttUtteranceBuffers.keys()) {
        if (key.startsWith(`${userId}:`)) {
          const buf = this.sttUtteranceBuffers.get(key);
          if (buf?.flushTimer) clearTimeout(buf.flushTimer);
          this.sttUtteranceBuffers.delete(key);
        }
      }
      // Clean up in-memory language preferences for this user
      for (const key of this.callLanguages.keys()) {
        if (key.includes(userId)) this.callLanguages.delete(key);
      }

      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
          await this.userModel.updateOne({ _id: userId }, { isOnline: false, lastSeen: new Date() });
          this.server.emit('user:offline', { userId });
        }
      }
    }
  }

  @SubscribeMessage('message:typing')
  async handleTyping(
    @ConnectedSocket() client: any,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.conversationId) return;
    const conv = await this.conversationModel.findById(data.conversationId);
    if (!conv) return;
    const participantIds = conv.participants.map((p: any) => p.userId.toString());
    if (!participantIds.includes(userId)) return;
    for (const uid of participantIds) {
      if (uid !== userId) {
        this.server.to(`user:${uid}`).emit('message:typing', {
          conversationId: data.conversationId,
          userId,
        });
      }
    }
  }

  @SubscribeMessage('message:delivered')
  async handleMessageDelivered(
    @ConnectedSocket() client: any,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.messageId || !data?.conversationId) return;

    try {
      // Update message status in DB — mark as delivered to this user
      await this.messageModel.updateOne(
        { _id: new Types.ObjectId(data.messageId) },
        {
          $addToSet: {
            'status.delivered': {
              userId: new Types.ObjectId(userId),
              at: new Date(),
            },
          },
        },
      );

      // Notify all participants (so sender sees double tick)
      this.emitMessageDelivered(data.messageId, userId, data.conversationId);
    } catch (err) {
      console.error(`[Socket] handleMessageDelivered error:`, err);
    }
  }

  @SubscribeMessage('call:offer')
  handleCallOffer(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; calleeId: string; sdp: any },
  ) {
    console.log(`[WebRTC] call:offer from ${client.userId} to ${data.calleeId}`);
    this.emitToUser(data.calleeId, 'call:offer', { callId: data.callId, sdp: data.sdp, callerId: client.userId });
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; callerId: string; sdp: any },
  ) {
    console.log(`[WebRTC] call:answer from ${client.userId} to ${data.callerId}`);
    this.emitToUser(data.callerId, 'call:answer', { callId: data.callId, sdp: data.sdp, calleeId: client.userId });
  }

  @SubscribeMessage('call:ice-candidate')
  handleCallIceCandidate(
    @ConnectedSocket() client: any,
    @MessageBody() data: { targetUserId: string; candidate: any },
  ) {
    console.log(`[WebRTC] call:ice-candidate from ${client.userId} to ${data.targetUserId}`);
    this.emitToUser(data.targetUserId, 'call:ice-candidate', { candidate: data.candidate, fromUserId: client.userId });
  }

  @SubscribeMessage('call:speech')
  async handleCallSpeech(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; text: string; targetLanguage?: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId || !data?.text?.trim()) return;

    console.log(`[Translation] call:speech from ${userId}: "${data.text}" (target: ${data.targetLanguage || 'auto'})`);

    try {
      // Find the call to get the other participant
      const call = await this.callModel.findById(data.callId).lean();
      if (!call) return;

      const otherUserId =
        (call as any).callerId.toString() === userId
          ? (call as any).calleeId.toString()
          : (call as any).callerId.toString();

      // Resolve target language from the RECEIVER's call preference.
      // Requirement: each listener hears incoming speech in their selected language.
      const memKey = `${data.callId}:${otherUserId}`;
      let targetLanguage: string = this.callLanguages.get(memKey) || data.targetLanguage || '';
      if (!targetLanguage) {
        const receiverUser = await this.userModel.findById(otherUserId).select('preferredLanguage').lean();
        targetLanguage = (receiverUser as any)?.preferredLanguage || 'en';
        // Seed in-memory map for future reads
        this.callLanguages.set(memKey, targetLanguage);
      }

      // Detect source language via translation service and skip if same as target
      const detected = await this.translationService.detectLanguage(data.text);
      if (detected === targetLanguage) {
        console.log(`[Translation] Same language (${detected}), skipping translation`);
        this.emitToUser(otherUserId, 'call:translated-text', {
          callId: data.callId,
          originalText: data.text,
          translatedText: data.text,
          targetLanguage,
          fromUserId: userId,
        });
        return;
      }

      // Translate the speech text
      const result = await this.translationService.translateText(data.text, targetLanguage);
      console.log(`[Translation] Result: "${result.translatedText}" (${targetLanguage})`);

      // Generate TTS audio for the translated text
      let audioBase64: string | undefined;
      try {
        console.log(`[Translation] Generating TTS for "${result.translatedText}" in ${targetLanguage}...`);
        const audioBuffer = await this.translationService.textToSpeech(result.translatedText, targetLanguage);
        audioBase64 = audioBuffer.toString('base64');
        console.log(`[Translation] TTS audio generated: ${audioBase64.length} chars base64 → sending to ${otherUserId}`);
      } catch (ttsErr) {
        console.error('[Translation] TTS failed, sending text only:', (ttsErr as any)?.message || ttsErr);
      }

      // Record TTS cooldown + text for the receiving user (echo prevention)
      if (audioBase64) {
        this.ttsCooldowns.set(otherUserId, Date.now());
        this.lastTtsText.set(otherUserId, result.translatedText);
      }

      // Send translated text + audio to the OTHER user
      this.emitToUser(otherUserId, 'call:translated-text', {
        callId: data.callId,
        originalText: data.text,
        translatedText: result.translatedText,
        targetLanguage,
        fromUserId: userId,
        audioBase64,
      });
    } catch (err) {
      console.error('[Translation] call:speech error:', err);
    }
  }

  @SubscribeMessage('call:start-stt')
  async handleStartStt(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; language: string; sttMode?: 'speaker' | 'listener' },
  ) {
    // DISABLED: Server-side STT (ElevenLabs/Whisper) replaced by browser STT.
    // Client uses browser SpeechRecognition → call:speech → translate → TTS.
    // Tell client immediately to use browser STT fallback.
    client.emit('call:stt-error', { callId: data?.callId, error: 'Server STT disabled — use browser STT' });
  }

  @SubscribeMessage('call:audio-chunk')
  handleAudioChunk(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; audio: string },
  ) {
    // DISABLED: Whisper PCM path is replaced by browser SpeechRecognition (call:speech).
    // The old path picked up background noise (e.g. TV audio) and sent it to Whisper,
    // producing wrong translations. Browser STT only captures intentional speech.
    return;
  }

  @SubscribeMessage('call:pause-stt')
  handlePauseStt(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId) return;
    // Pause BOTH speaker and listener sessions to prevent echo
    const speakerKey = `${userId}:${data.callId}`;
    const listenerKey = `listener:${userId}:${data.callId}`;
    this.pausedSttSessions.add(speakerKey);
    this.pausedSttSessions.add(listenerKey);
    console.log(`[STT] Paused sessions ${speakerKey} + ${listenerKey} (TTS playing on user's device)`);
  }

  @SubscribeMessage('call:resume-stt')
  handleResumeStt(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId) return;
    const speakerKey = `${userId}:${data.callId}`;
    const listenerKey = `listener:${userId}:${data.callId}`;
    this.pausedSttSessions.delete(speakerKey);
    this.pausedSttSessions.delete(listenerKey);
    console.log(`[STT] Resumed sessions ${speakerKey} + ${listenerKey} (TTS playback finished)`);
  }

  @SubscribeMessage('call:stop-stt')
  handleStopStt(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId) return;

    const sessionKey = `${userId}:${data.callId}`;
    const session = this.sttSessions.get(sessionKey);
    if (session) {
      console.log(`[STT] Stopping session for user ${userId}, call ${data.callId}`);
      session.close();
      this.sttSessions.delete(sessionKey);
    }

    // Also stop any Whisper buffer for this session
    const whisperBuf = this.whisperBuffers.get(sessionKey);
    if (whisperBuf) {
      if (whisperBuf.timer) clearTimeout(whisperBuf.timer);
      this.whisperBuffers.delete(sessionKey);
    }
  }

  /**
   * Whisper STT — start accumulating audio chunks for OpenAI Whisper transcription.
   * Falls back to ElevenLabs STT if Whisper fails (e.g., quota exceeded).
   * Client sends call:start-whisper-stt, then call:audio-chunk as usual.
   * Audio is accumulated and sent to Whisper every ~2s of audio or on silence.
   */
  @SubscribeMessage('call:start-whisper-stt')
  async handleStartWhisperStt(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; language: string; sttMode?: 'speaker' | 'listener' },
  ) {
    // DISABLED: Whisper STT replaced by browser STT (call:speech path).
    client.emit('call:stt-error', { callId: data?.callId, error: 'Whisper disabled — use browser STT' });
  }

  /**
   * DISABLED: Whisper audio processing replaced by browser STT (call:speech path).
   */
  @SubscribeMessage('call:whisper-audio')
  async handleWhisperAudio(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; audio: string },
  ) {
    // DISABLED: All Whisper STT replaced by browser STT. Ignore all whisper audio.
    return;
  }

  /** DISABLED: Whisper flush replaced by browser STT. */
  private async flushWhisperBuffer(client: any, sessionKey: string, callId: string, userId: string) {
    // DISABLED: All Whisper STT replaced by browser STT.
    return;
  }

  // ─── LISTENER MODE: Separate Whisper STT for remote stream audio ─────────
  // These handlers work identically to the speaker-mode Whisper STT but use
  // a separate session key prefix (`listener:`) so both can run simultaneously.
  // In listener mode, the translated audio is sent BACK to the requesting user
  // (not to the other participant), because the requesting user wants to hear
  // the remote user's speech in their own language.

  private listenerWhisperBuffers = new Map<
    string,
    { chunks: Buffer[]; totalBytes: number; timer?: ReturnType<typeof setTimeout>; language?: string }
  >();

  @SubscribeMessage('call:start-whisper-stt-listener')
  async handleStartWhisperSttListener(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; language: string; sttMode?: string },
  ) {
    // DISABLED: Listener Whisper STT replaced by browser STT.
    client.emit('call:stt-error', { callId: data?.callId, error: 'Listener STT disabled — use browser STT' });
  }

  @SubscribeMessage('call:audio-chunk-listener')
  handleAudioChunkListener(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; audio: string },
  ) {
    // DISABLED: Listener Whisper path replaced by browser STT (call:speech).
    return;
  }

  @SubscribeMessage('call:stop-stt-listener')
  handleStopSttListener(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId) return;

    const sessionKey = `listener:${userId}:${data.callId}`;
    const buf = this.listenerWhisperBuffers.get(sessionKey);
    if (buf) {
      if (buf.timer) clearTimeout(buf.timer);
      this.listenerWhisperBuffers.delete(sessionKey);
      console.log(`[Whisper STT Listener] Stopped for user ${userId}`);
    }
  }

  /** DISABLED: Listener Whisper flush replaced by browser STT. */
  private async flushListenerWhisperBuffer(client: any, sessionKey: string, callId: string, userId: string) {
    // DISABLED: All Whisper STT replaced by browser STT.
    return;
  }

  @SubscribeMessage('call:update-language')
  async handleUpdateLanguage(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; language: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.language) return;

    // Update in-memory map IMMEDIATELY (no DB read lag)
    if (data.callId) {
      const key = `${data.callId}:${userId}`;
      this.callLanguages.set(key, data.language);
      console.log(`[Language] In-memory updated: ${key} → ${data.language}`);
    }

    // Also persist to DB for next call
    await this.userModel.updateOne(
      { _id: userId },
      { preferredLanguage: data.language },
    );

    console.log(`[Language] User ${userId} changed receive language to ${data.language}`);

    // Notify the OTHER user in the call that this user changed their listening language
    if (data.callId) {
      try {
        const call = await this.callModel.findById(data.callId).lean();
        if (call) {
          const otherUserId =
            (call as any).callerId.toString() === userId
              ? (call as any).calleeId.toString()
              : (call as any).callerId.toString();
          this.emitToUser(otherUserId, 'call:language-changed', {
            callId: data.callId,
            userId,
            language: data.language,
          });
        }
      } catch (err) {
        console.error('[Language] Failed to notify other user:', err);
      }
    }

    client.emit('call:language-updated', { language: data.language });
  }

  async emitNewMessage(message: any) {
    try {
      if (!message?.conversationId) {
        console.error('[Socket] emitNewMessage: message has no conversationId', message);
        return;
      }
      const conv = await this.conversationModel.findById(message.conversationId);
      if (!conv) {
        console.error(`[Socket] emitNewMessage: conversation ${message.conversationId} not found`);
        return;
      }
      const participantIds = conv.participants.map((p: any) => p.userId.toString());
      console.log(`[Socket] emitNewMessage: conv=${message.conversationId}, sender=${message.senderId}, participants=${JSON.stringify(participantIds)}, connected users: ${JSON.stringify([...this.userSockets.keys()])}`);
      
      let emittedToCount = 0;
      for (const uid of participantIds) {
        if (uid !== message.senderId) {
          try {
            this.emitToUser(uid, 'message:receive', message);
            emittedToCount++;
          } catch (emitErr) {
            console.error(`[Socket] Error emitting to user:${uid}:`, emitErr);
          }
        }
      }
      console.log(`[Socket] emitNewMessage: emitted to ${emittedToCount} participant(s)`);
    } catch (err) {
      console.error('[Socket] emitNewMessage failed:', err);
    }
  }

  async emitMessageEdited(message: any) {
    try {
      if (!message?.conversationId) return;
      const conv = await this.conversationModel.findById(message.conversationId);
      if (!conv) return;
      const participantIds = conv.participants.map((p: any) => p.userId.toString());
      for (const uid of participantIds) {
        if (uid !== message.senderId) {
          try {
            this.emitToUser(uid, 'message:edited', message);
          } catch (emitErr) {
            console.error(`[Socket] Error emitting message:edited to user:${uid}:`, emitErr);
          }
        }
      }
    } catch (err) {
      console.error('[Socket] emitMessageEdited failed:', err);
    }
  }

  async emitMessageDelete(messageId: string, conversationId: string) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) return;
    const participantIds = conv.participants.map((p: any) => p.userId.toString());
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('message:delete', { messageId, conversationId });
    }
  }

  async emitMessageDelivered(messageId: string, userId: string, conversationId: string) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) return;
    const participantIds = conv.participants.map((p: any) => p.userId.toString());
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('message:delivered', { messageId, userId, conversationId });
    }
  }

  async emitMessageRead(messageIds: string[], userId: string, conversationId: string) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) return;
    const participantIds = conv.participants.map((p: any) => p.userId.toString());
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('message:read', { messageIds, userId, conversationId });
    }
  }

  /** Notify all participants when a new conversation is created */
  async emitConversationCreated(conversationId: string, participantIds: string[]) {
    for (const uid of participantIds) {
      this.emitToUser(uid, 'conversation:new', { conversationId });
    }
    console.log(`[Socket] Emitted conversation:new to ${participantIds.length} participant(s) for conv=${conversationId}`);
  }

  emitCallInitiate(callId: string, callerId: string, callerName: string, calleeId: string, type: string) {
    console.log(`[Socket] Emitting call:initiate to user:${calleeId}, connected users: ${JSON.stringify([...this.userSockets.keys()])}`);
    this.emitToUser(calleeId, 'call:initiate', {
      callId,
      callerId,
      callerName,
      calleeId,
      type,
    });
  }

  emitCallAnswered(callId: string, callerId: string, calleeName: string) {
    this.emitToUser(callerId, 'call:answered', { callId, calleeName });
  }

  emitCallRejected(callId: string, calleeId: string) {
    this.emitToUser(calleeId, 'call:rejected', { callId, calleeId });
  }

  emitCallEnded(callId: string, targetUserId: string) {
    this.emitToUser(targetUserId, 'call:ended', { callId });
  }

  /** Public method for TranslationAgentController to send translated text to a user */
  emitTranslatedText(
    targetUserId: string,
    callId: string,
    originalText: string,
    translatedText: string,
    targetLanguage: string,
    fromUserId: string,
    audioBase64?: string,
  ) {
    this.emitToUser(targetUserId, 'call:translated-text', {
      callId,
      originalText,
      translatedText,
      targetLanguage,
      fromUserId,
      audioBase64,
    });
  }

  joinConversation(socketId: string, conversationId: string) {
    this.server.in(socketId).socketsJoin(`conversation:${conversationId}`);
  }

  leaveConversation(socketId: string, conversationId: string) {
    this.server.in(socketId).socketsLeave(`conversation:${conversationId}`);
  }

  emitGroupUpdated(groupId: string, changes: any) {
    this.server.emit('group:updated', { groupId, changes });
  }

  emitGroupMemberAdded(groupId: string, userId: string) {
    this.server.emit('group:member_added', { groupId, userId });
  }

  emitGroupMemberRemoved(groupId: string, userId: string) {
    this.server.emit('group:member_removed', { groupId, userId });
  }

  async emitPollVote(messageId: string, poll: any, conversationId: string, participantIds: string[]) {
    for (const uid of participantIds) {
      this.emitToUser(uid, 'poll:vote', { messageId, poll, conversationId });
    }
  }
}
