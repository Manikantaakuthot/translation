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
    const userId = client.userId;
    if (!userId || !data?.callId) return;

    const sessionKey = `${userId}:${data.callId}`;
    const sttMode = data.sttMode || 'speaker';

    // Close existing session if any
    const existing = this.sttSessions.get(sessionKey);
    if (existing) {
      existing.close();
      this.sttSessions.delete(sessionKey);
    }

    console.log(`[STT] Starting ElevenLabs STT for user ${userId}, call ${data.callId}, lang ${data.language}`);
    console.log(
      `[voice_stage] stt_started engine=elevenlabs callId=${data.callId} userId=${userId} sttMode=${sttMode} language=${data.language}`,
    );

    try {
      // Find the other user for this call
      const call = await this.callModel.findById(data.callId).lean();
      if (!call) return;

      const otherUserId =
        (call as any).callerId.toString() === userId
          ? (call as any).calleeId.toString()
          : (call as any).callerId.toString();

      // Who should receive the TTS audio?
      // - speaker mode: translate THIS user's audio → send to OTHER participant
      // - listener mode: translate remote audio captured on THIS device → send back to THIS user
      const receiverUserId = sttMode === 'listener' ? userId : otherUserId;
      // What should `fromUserId` mean on the client?
      // It's the "speaker" whose voice was translated.
      const fromUserIdForClient = sttMode === 'listener' ? otherUserId : userId;

      const session = this.elevenlabsService.createSttWebSocket(data.language, {
        onTranscript: async (text: string, isFinal: boolean, detectedLanguage?: string, avgLogprob?: number) => {
          // Send partial transcripts back to the speaker for display
          client.emit('call:stt-transcript', {
            callId: data.callId,
            text,
            isFinal,
          });

          if (isFinal && text.trim()) {
            console.log(
              `[voice_stage] transcript_final engine=elevenlabs callId=${data.callId} userId=${userId} chars=${text.trim().length} detected=${detectedLanguage || 'unknown'}`,
            );
            // Skip very short transcripts (garbled echo fragments)
            if (text.trim().length < 3) {
              console.log(`[STT] Skipping too-short transcript: "${text}"`);
              return;
            }

            // Confidence-based filtering — low logprob = likely garbage/echo, not real speech.
            // We keep it permissive for "ultra smooth" translation so we don't drop real sentences.
            const minAvgLogprob = Number(process.env.STT_MIN_AVG_LOGPROB ?? '-7.0');
            if (avgLogprob !== undefined && avgLogprob < minAvgLogprob && text.trim().length < 12) {
              console.log(`[STT] Low confidence transcript (logprob: ${avgLogprob.toFixed(2)}), discarding short: "${text}"`);
              return;
            }

            // Skip transcripts during TTS cooldown (best-effort echo prevention)
            const ttsCooldownMs = Number(process.env.STT_TTS_COOLDOWN_MS ?? '2500');
            const lastTts = this.ttsCooldowns.get(userId) || 0;
            if (Date.now() - lastTts < ttsCooldownMs) {
              console.log(`[STT] Ignoring transcript from ${userId} — TTS cooldown active (echo prevention)`);
              return;
            }

            // Textual echo cancellation — if transcript matches recent TTS text, it's the mic picking up TTS audio
            const lastTtsText = this.lastTtsText.get(userId);
            if (lastTtsText && this.isSimilarText(text, lastTtsText)) {
              console.log(`[STT] Discarding textual echo from ${userId} — transcript "${text}" matches recent TTS "${lastTtsText}"`);
              this.lastTtsText.delete(userId); // Clear after one match
              return;
            }

            const minUtteranceChars = Number(process.env.STT_MIN_UTTERANCE_CHARS ?? '25');
            const maxBufferMs = Number(process.env.STT_MAX_UTTERANCE_BUFFER_MS ?? '1200');
            const detectedSource = (detectedLanguage && detectedLanguage !== 'unknown') ? detectedLanguage : undefined;

            // Buffer short "final" fragments into a bigger utterance for better translation accuracy.
            const existingBuf = this.sttUtteranceBuffers.get(sessionKey);
            if (!existingBuf) {
              this.sttUtteranceBuffers.set(sessionKey, { text, firstAt: Date.now(), sourceLanguage: detectedSource });
            } else {
              // Deduplicate: skip if this fragment is identical or very similar to the last appended text
              const lastFragment = existingBuf.text.split(/\s{2,}/).pop()?.trim() || '';
              if (lastFragment && this.isSimilarText(text.trim(), lastFragment)) {
                console.log(`[STT] Dedup: skipping duplicate fragment "${text.trim()}" (matches last: "${lastFragment}")`);
                return;
              }
              existingBuf.text = existingBuf.text ? `${existingBuf.text} ${text}` : text;
              if (!existingBuf.sourceLanguage && detectedSource) existingBuf.sourceLanguage = detectedSource;
            }

            const buf = this.sttUtteranceBuffers.get(sessionKey)!;
            const combinedText = buf.text.trim();
            const elapsedMs = Date.now() - buf.firstAt;
            const shouldFlush = combinedText.length >= minUtteranceChars || elapsedMs >= maxBufferMs;

            const flushNow = async (finalText: string, finalSourceLanguage?: string) => {
              // The translated audio should be delivered to `receiverUserId`.
              // So the target language must come from the receiver's selected language.
              const memKey = `${data.callId}:${receiverUserId}`;
              let targetLanguage = this.callLanguages.get(memKey) || '';
              if (!targetLanguage) {
                const receiverUser = await this.userModel.findById(receiverUserId).select('preferredLanguage').lean();
                targetLanguage = (receiverUser as any)?.preferredLanguage || 'en';
                this.callLanguages.set(memKey, targetLanguage);
              }

              // Validate detected language — warn if it doesn't match expected languages.
              const receiverUser = await this.userModel.findById(receiverUserId).select('preferredLanguage').lean();
              const expectedLangs = ['en', targetLanguage, (receiverUser as any)?.preferredLanguage].filter(Boolean);
              const expectedLangsSet = new Set(expectedLangs);

              if (finalSourceLanguage && !expectedLangsSet.has(finalSourceLanguage)) {
                console.warn(`[STT] Unexpected language "${finalSourceLanguage}" (expected [${expectedLangs}]), processing anyway`);
              }

              // Unicode script validation — warn but still process
              if (!this.isValidScript(finalText, expectedLangs)) {
                console.warn(`[STT] Unexpected script for languages [${expectedLangs}]: "${finalText.substring(0, 50)}", processing anyway`);
              }

              console.log(`[STT→Translate] Source: ${finalSourceLanguage || 'auto'}, Target: ${targetLanguage}`);

              // If source and target are the same, skip translation — send original text directly
              if (finalSourceLanguage && finalSourceLanguage === targetLanguage) {
                console.log(`[STT→Translate] Same language (${finalSourceLanguage}), skipping translation`);
                this.emitToUser(receiverUserId, 'call:translated-text', {
                  callId: data.callId,
                  originalText: finalText,
                  translatedText: finalText,
                  targetLanguage,
                  fromUserId: fromUserIdForClient,
                });
                return;
              }

              const result = await this.translationService.translateText(finalText, targetLanguage, finalSourceLanguage);
              console.log(`[STT→Translate] "${finalText}" → "${result.translatedText}" (${targetLanguage})`);
              console.log(
                `[voice_stage] translation_done engine=elevenlabs callId=${data.callId} userId=${userId} receiverUserId=${receiverUserId} targetLanguage=${targetLanguage} srcChars=${finalText.length} dstChars=${result.translatedText.length}`,
              );

              let audioBase64: string | undefined;
              try {
                const audioBuffer = await this.translationService.textToSpeech(result.translatedText, targetLanguage);
                audioBase64 = audioBuffer.toString('base64');
                console.log(
                  `[voice_stage] tts_done engine=elevenlabs callId=${data.callId} receiverUserId=${receiverUserId} targetLanguage=${targetLanguage} audioBytes=${audioBuffer.length}`,
                );
              } catch (ttsErr) {
                console.error('[STT→TTS] TTS failed:', ttsErr);
              }

              if (audioBase64) {
                // Echo prevention: cooldown/compare transcripts for the receiver (who will play TTS).
                this.ttsCooldowns.set(receiverUserId, Date.now());
                this.lastTtsText.set(receiverUserId, result.translatedText);
              }

              this.emitToUser(receiverUserId, 'call:translated-text', {
                callId: data.callId,
                originalText: finalText,
                translatedText: result.translatedText,
                targetLanguage,
                fromUserId: fromUserIdForClient,
                audioBase64,
              });
            };

            if (!shouldFlush) {
              if (!buf.flushTimer) {
                buf.flushTimer = setTimeout(() => {
                  const currentBuf = this.sttUtteranceBuffers.get(sessionKey);
                  if (!currentBuf) return;
                  this.sttUtteranceBuffers.delete(sessionKey);
                  const t = currentBuf.text.trim();
                  const src = currentBuf.sourceLanguage;
                  flushNow(t, src).catch((err) => console.error('[STT→Translate] Flush failed:', err));
                }, maxBufferMs);
              }
              return;
            }

            // Flush now
            if (buf.flushTimer) clearTimeout(buf.flushTimer);
            this.sttUtteranceBuffers.delete(sessionKey);
            flushNow(combinedText, buf.sourceLanguage).catch((err) => {
              console.error('[STT→Translate] Translation failed:', err);
            });
          }
        },
        onError: (error: string) => {
          console.error(`[STT] Error for user ${userId}:`, error);
          client.emit('call:stt-error', { callId: data.callId, error });
        },
        onClose: () => {
          console.log(`[STT] Session closed for user ${userId}`);
          this.sttSessions.delete(sessionKey);
        },
      });

      this.sttSessions.set(sessionKey, session);
      client.emit('call:stt-started', { callId: data.callId });
    } catch (err) {
      console.error('[STT] Failed to start:', err);
      client.emit('call:stt-error', { callId: data.callId, error: 'Failed to start STT' });
    }
  }

  @SubscribeMessage('call:audio-chunk')
  handleAudioChunk(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; audio: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId || !data?.audio) return;

    const sessionKey = `${userId}:${data.callId}`;
    const now = Date.now();
    const lastLogAt = this.audioChunkLogAt.get(sessionKey) || 0;
    if (now - lastLogAt > 2000) {
      console.log(
        `[voice_stage] audio_chunk_rx callId=${data.callId} userId=${userId} sessionKey=${sessionKey} base64Chars=${data.audio.length}`,
      );
      this.audioChunkLogAt.set(sessionKey, now);
    }

    // Half-duplex: don't forward audio to STT while TTS is playing on this user's device
    if (this.pausedSttSessions.has(sessionKey)) return;

    // If Whisper STT is active for this session, route audio there instead
    const whisperBuf = this.whisperBuffers.get(sessionKey);
    if (whisperBuf) {
      const audioChunk = Buffer.from(data.audio, 'base64');
      whisperBuf.chunks.push(audioChunk);
      whisperBuf.totalBytes += audioChunk.length;

      if (whisperBuf.timer) clearTimeout(whisperBuf.timer);

      const flushThreshold = Number(process.env.WHISPER_FLUSH_THRESHOLD_BYTES ?? '24000'); // ~0.75s default
      if (whisperBuf.totalBytes >= flushThreshold) {
        this.flushWhisperBuffer(client, sessionKey, data.callId, userId);
      } else {
        whisperBuf.timer = setTimeout(async () => {
          if (this.whisperBuffers.has(sessionKey) && whisperBuf.totalBytes > 1200) {
            await this.flushWhisperBuffer(client, sessionKey, data.callId, userId);
          }
        }, Number(process.env.WHISPER_SILENCE_FLUSH_MS ?? '500'));
      }
      return;
    }

    // Otherwise use ElevenLabs STT session
    const session = this.sttSessions.get(sessionKey);
    if (session) {
      session.sendAudio(data.audio);
    }
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
    const userId = client.userId;
    if (!userId || !data?.callId) return;

    const sessionKey = `${userId}:${data.callId}`;
    const sttMode = data.sttMode || 'speaker';

    // Check if OpenAI key is available; if not, fall back to ElevenLabs immediately
    if (!process.env.OPENAI_API_KEY) {
      console.log(`[Whisper STT] No OPENAI_API_KEY, falling back to ElevenLabs STT`);
      return this.handleStartStt(client, data);
    }

    // Close any existing ElevenLabs STT session
    const existing = this.sttSessions.get(sessionKey);
    if (existing) {
      existing.close();
      this.sttSessions.delete(sessionKey);
    }

    // Clear any existing Whisper buffer
    const existingBuf = this.whisperBuffers.get(sessionKey);
    if (existingBuf?.timer) clearTimeout(existingBuf.timer);

    console.log(`[Whisper STT] Starting for user ${userId}, call ${data.callId}, lang ${data.language}`);
    console.log(
      `[voice_stage] stt_started engine=whisper callId=${data.callId} userId=${userId} sttMode=${sttMode} language=${data.language}`,
    );

    this.whisperBuffers.set(sessionKey, {
      chunks: [],
      totalBytes: 0,
      language: data.language,
      sttMode,
    });

    client.emit('call:stt-started', { callId: data.callId, engine: 'whisper' });
  }

  /**
   * Handle audio chunks for Whisper STT.
   * Accumulates audio and transcribes when enough data is collected (~2s).
   */
  @SubscribeMessage('call:whisper-audio')
  async handleWhisperAudio(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; audio: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId || !data?.audio) return;

    const sessionKey = `${userId}:${data.callId}`;

    // Half-duplex: don't process audio while TTS is playing
    if (this.pausedSttSessions.has(sessionKey)) return;

    const buf = this.whisperBuffers.get(sessionKey);
    if (!buf) return; // Whisper STT not started for this session

    const audioChunk = Buffer.from(data.audio, 'base64');
    buf.chunks.push(audioChunk);
    buf.totalBytes += audioChunk.length;

    // Reset flush timer on each chunk
    if (buf.timer) clearTimeout(buf.timer);

    // 16kHz 16-bit mono = 32000 bytes/sec. Keep this low for near real-time updates.
    const flushThreshold = Number(process.env.WHISPER_FLUSH_THRESHOLD_BYTES ?? '24000');

    if (buf.totalBytes >= flushThreshold) {
      await this.flushWhisperBuffer(client, sessionKey, data.callId, userId);
    } else {
      // Flush quickly on brief silence for lower end-to-end latency.
      buf.timer = setTimeout(async () => {
        if (this.whisperBuffers.has(sessionKey) && buf.totalBytes > 1200) {
          await this.flushWhisperBuffer(client, sessionKey, data.callId, userId);
        }
      }, Number(process.env.WHISPER_SILENCE_FLUSH_MS ?? '500'));
    }
  }

  /** Flush accumulated Whisper audio buffer → transcribe → translate → TTS */
  private async flushWhisperBuffer(client: any, sessionKey: string, callId: string, userId: string) {
    const buf = this.whisperBuffers.get(sessionKey);
    if (!buf || buf.chunks.length === 0) return;

    // Extract and reset buffer
    const audioBuffer = Buffer.concat(buf.chunks);
    const language = buf.language;
    const sttMode = buf.sttMode || 'speaker';
    buf.chunks = [];
    buf.totalBytes = 0;
    if (buf.timer) clearTimeout(buf.timer);

    try {
      const audioBase64 = audioBuffer.toString('base64');
      console.log(`[Whisper STT] Transcribing ${audioBuffer.length} bytes for user ${userId}`);

      const result = await this.whisperSttService.transcribe(audioBase64, language, true);

      if (!result.text.trim() || result.text.trim().length < 2) {
        console.log(`[Whisper STT] Empty/too-short transcript, skipping`);
        return;
      }

      console.log(`[Whisper STT] Transcript: "${result.text}" (detected: ${result.detectedLanguage})`);
      console.log(
        `[voice_stage] transcript_final engine=whisper callId=${callId} userId=${userId} chars=${result.text.trim().length} detected=${result.detectedLanguage || language || 'unknown'}`,
      );

      // Send transcript to client for display
      client.emit('call:stt-transcript', {
        callId,
        text: result.text,
        isFinal: true,
        engine: 'whisper',
      });

      // Now translate + TTS (same flow as ElevenLabs STT)
      const call = await this.callModel.findById(callId).lean();
      if (!call) return;

      const otherUserId =
        (call as any).callerId.toString() === userId
          ? (call as any).calleeId.toString()
          : (call as any).callerId.toString();

      const receiverUserId = sttMode === 'listener' ? userId : otherUserId;
      const fromUserIdForClient = sttMode === 'listener' ? otherUserId : userId;

      // Get target language from the receiver's selected language.
      const memKey = `${callId}:${receiverUserId}`;
      let targetLanguage = this.callLanguages.get(memKey) || '';
      if (!targetLanguage) {
        const receiverUser = await this.userModel.findById(receiverUserId).select('preferredLanguage').lean();
        targetLanguage = (receiverUser as any)?.preferredLanguage || 'en';
        this.callLanguages.set(memKey, targetLanguage);
      }

      // Skip translation if same language
      const detectedLang = result.detectedLanguage || language;
      if (detectedLang && detectedLang === targetLanguage) {
        console.log(`[Whisper→Translate] Same language (${detectedLang}), skipping translation`);
        this.emitToUser(receiverUserId, 'call:translated-text', {
          callId,
          originalText: result.text,
          translatedText: result.text,
          targetLanguage,
          fromUserId: fromUserIdForClient,
        });
        return;
      }

      // Translate
      const translation = await this.translationService.translateText(result.text, targetLanguage, detectedLang);
      console.log(`[Whisper→Translate] "${result.text}" → "${translation.translatedText}" (${targetLanguage})`);
      console.log(
        `[voice_stage] translation_done engine=whisper callId=${callId} userId=${userId} receiverUserId=${receiverUserId} targetLanguage=${targetLanguage} srcChars=${result.text.length} dstChars=${translation.translatedText.length}`,
      );

      // TTS
      let ttsAudioBase64: string | undefined;
      try {
        const ttsBuffer = await this.translationService.textToSpeech(translation.translatedText, targetLanguage);
        ttsAudioBase64 = ttsBuffer.toString('base64');
        console.log(
          `[voice_stage] tts_done engine=whisper callId=${callId} receiverUserId=${receiverUserId} targetLanguage=${targetLanguage} audioBytes=${ttsBuffer.length}`,
        );
      } catch (ttsErr) {
        console.error('[Whisper→TTS] TTS failed:', ttsErr);
      }

      if (ttsAudioBase64) {
        this.ttsCooldowns.set(receiverUserId, Date.now());
        this.lastTtsText.set(receiverUserId, translation.translatedText);
      }

      this.emitToUser(receiverUserId, 'call:translated-text', {
        callId,
        originalText: result.text,
        translatedText: translation.translatedText,
        targetLanguage,
        fromUserId: fromUserIdForClient,
        audioBase64: ttsAudioBase64,
      });
    } catch (err: any) {
      const isQuotaError = err?.status === 429 || err?.code === 'insufficient_quota';
      console.error(`[Whisper STT] Transcription error (quota: ${isQuotaError}):`, err?.message || err);

      if (isQuotaError) {
        // OpenAI quota exceeded — fall back to ElevenLabs STT permanently for this session
        console.log(`[Whisper STT] OpenAI quota exceeded, switching to ElevenLabs STT for session ${sessionKey}`);
        this.whisperBuffers.delete(sessionKey);

        // Start ElevenLabs STT session as fallback
        this.handleStartStt(client, { callId, language: language || 'auto', sttMode: sttMode as any });
        client.emit('call:stt-fallback', { callId, engine: 'elevenlabs', reason: 'OpenAI quota exceeded' });
      } else {
        client.emit('call:stt-error', { callId, error: 'Whisper transcription failed' });
      }
    }
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
    const userId = client.userId;
    if (!userId || !data?.callId) return;

    const sessionKey = `listener:${userId}:${data.callId}`;

    if (!process.env.OPENAI_API_KEY) {
      console.warn('[Whisper STT Listener] No OPENAI_API_KEY');
      client.emit('call:stt-error', { callId: data.callId, error: 'OpenAI API key not configured' });
      return;
    }

    // Clear any existing listener buffer
    const existingBuf = this.listenerWhisperBuffers.get(sessionKey);
    if (existingBuf?.timer) clearTimeout(existingBuf.timer);

    console.log(`[Whisper STT Listener] Starting for user ${userId}, call ${data.callId}`);
    console.log(
      `[voice_stage] stt_started engine=whisper-listener callId=${data.callId} userId=${userId} mode=listener language=${data.language}`,
    );

    this.listenerWhisperBuffers.set(sessionKey, {
      chunks: [],
      totalBytes: 0,
      language: data.language,
    });

    client.emit('call:stt-started', { callId: data.callId, engine: 'whisper-listener' });
  }

  @SubscribeMessage('call:audio-chunk-listener')
  handleAudioChunkListener(
    @ConnectedSocket() client: any,
    @MessageBody() data: { callId: string; audio: string },
  ) {
    const userId = client.userId;
    if (!userId || !data?.callId || !data?.audio) return;

    const sessionKey = `listener:${userId}:${data.callId}`;
    const now = Date.now();
    const lastLogAt = this.audioChunkLogAt.get(sessionKey) || 0;
    if (now - lastLogAt > 2000) {
      console.log(
        `[voice_stage] audio_chunk_rx callId=${data.callId} userId=${userId} sessionKey=${sessionKey} base64Chars=${data.audio.length} mode=listener`,
      );
      this.audioChunkLogAt.set(sessionKey, now);
    }

    // Half-duplex: don't process while TTS is playing on this user's device
    if (this.pausedSttSessions.has(sessionKey)) return;

    const buf = this.listenerWhisperBuffers.get(sessionKey);
    if (!buf) return;

    const audioChunk = Buffer.from(data.audio, 'base64');
    buf.chunks.push(audioChunk);
    buf.totalBytes += audioChunk.length;

    if (buf.timer) clearTimeout(buf.timer);

    const flushThreshold = Number(process.env.WHISPER_FLUSH_THRESHOLD_BYTES ?? '24000');

    if (buf.totalBytes >= flushThreshold) {
      this.flushListenerWhisperBuffer(client, sessionKey, data.callId, userId);
    } else {
      buf.timer = setTimeout(async () => {
        if (this.listenerWhisperBuffers.has(sessionKey) && buf.totalBytes > 1200) {
          await this.flushListenerWhisperBuffer(client, sessionKey, data.callId, userId);
        }
      }, Number(process.env.WHISPER_SILENCE_FLUSH_MS ?? '500'));
    }
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

  /** Flush listener-mode Whisper buffer → transcribe → translate → send TTS back to THIS user */
  private async flushListenerWhisperBuffer(client: any, sessionKey: string, callId: string, userId: string) {
    const buf = this.listenerWhisperBuffers.get(sessionKey);
    if (!buf || buf.chunks.length === 0) return;

    const audioBuffer = Buffer.concat(buf.chunks);
    const language = buf.language;
    buf.chunks = [];
    buf.totalBytes = 0;
    if (buf.timer) clearTimeout(buf.timer);

    try {
      const audioBase64 = audioBuffer.toString('base64');
      console.log(`[Whisper STT Listener] Transcribing ${audioBuffer.length} bytes for user ${userId}`);

      const result = await this.whisperSttService.transcribe(audioBase64, language, true);

      if (!result.text.trim() || result.text.trim().length < 2) return;

      console.log(`[Whisper STT Listener] Transcript: "${result.text}" (detected: ${result.detectedLanguage})`);
      console.log(
        `[voice_stage] transcript_final engine=whisper-listener callId=${callId} userId=${userId} chars=${result.text.trim().length} detected=${result.detectedLanguage || language || 'unknown'}`,
      );

      // Find the other user in the call (the speaker whose voice we captured)
      const call = await this.callModel.findById(callId).lean();
      if (!call) return;

      const otherUserId =
        (call as any).callerId.toString() === userId
          ? (call as any).calleeId.toString()
          : (call as any).callerId.toString();

      // In LISTENER mode: the receiver is THIS user (userId) — they want to hear the translation
      const receiverUserId = userId;
      // fromUserId = the other user (the speaker whose voice was transcribed)
      const fromUserIdForClient = otherUserId;

      // Get target language from THIS user's preference (the listener)
      const memKey = `${callId}:${receiverUserId}`;
      let targetLanguage = this.callLanguages.get(memKey) || '';
      if (!targetLanguage) {
        const receiverUser = await this.userModel.findById(receiverUserId).select('preferredLanguage').lean();
        targetLanguage = (receiverUser as any)?.preferredLanguage || 'en';
        this.callLanguages.set(memKey, targetLanguage);
      }

      // Skip translation if same language
      const detectedLang = result.detectedLanguage || language;
      if (detectedLang && detectedLang === targetLanguage) {
        console.log(`[Whisper Listener→Translate] Same language (${detectedLang}), skipping`);
        this.emitToUser(receiverUserId, 'call:translated-text', {
          callId,
          originalText: result.text,
          translatedText: result.text,
          targetLanguage,
          fromUserId: fromUserIdForClient,
        });
        return;
      }

      // Translate
      const translation = await this.translationService.translateText(result.text, targetLanguage, detectedLang);
      console.log(`[Whisper Listener→Translate] "${result.text}" → "${translation.translatedText}" (${targetLanguage})`);
      console.log(
        `[voice_stage] translation_done engine=whisper-listener callId=${callId} userId=${userId} receiverUserId=${receiverUserId} targetLanguage=${targetLanguage} srcChars=${result.text.length} dstChars=${translation.translatedText.length}`,
      );

      // TTS
      let ttsAudioBase64: string | undefined;
      try {
        const ttsBuffer = await this.translationService.textToSpeech(translation.translatedText, targetLanguage);
        ttsAudioBase64 = ttsBuffer.toString('base64');
        console.log(
          `[voice_stage] tts_done engine=whisper-listener callId=${callId} receiverUserId=${receiverUserId} targetLanguage=${targetLanguage} audioBytes=${ttsBuffer.length}`,
        );
      } catch (ttsErr) {
        console.error('[Whisper Listener→TTS] TTS failed:', ttsErr);
      }

      if (ttsAudioBase64) {
        this.ttsCooldowns.set(receiverUserId, Date.now());
        this.lastTtsText.set(receiverUserId, translation.translatedText);
      }

      // Send back to THIS user (the listener who toggled translation)
      this.emitToUser(receiverUserId, 'call:translated-text', {
        callId,
        originalText: result.text,
        translatedText: translation.translatedText,
        targetLanguage,
        fromUserId: fromUserIdForClient,
        audioBase64: ttsAudioBase64,
      });
    } catch (err: any) {
      console.error(`[Whisper STT Listener] Error:`, err?.message || err);
      client.emit('call:stt-error', { callId, error: 'Listener transcription failed' });
    }
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
