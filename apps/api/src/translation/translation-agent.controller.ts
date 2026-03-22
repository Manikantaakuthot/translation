import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  Inject,
  forwardRef,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { TranslationService } from './translation.service';
import { EventsGateway } from '../events/events.gateway';
import * as https from 'https';

/**
 * BlackBox-style Custom LLM endpoint for ElevenLabs Conversational AI Agent.
 *
 * Architecture:
 *   Client (WebRTC) → ElevenLabs Agent (STT + AEC) → Custom LLM (this endpoint) → Translation → Socket.IO to other user
 *
 * The agent captures mic audio via WebRTC (built-in echo cancellation),
 * transcribes it, and sends the transcript here as an OpenAI-format chat completion.
 * We translate the text and send it (with TTS audio) to the other user via Socket.IO.
 * We return a minimal response to the agent so it stays quiet.
 */
@SkipThrottle()
@Controller('translation-agent')
export class TranslationAgentController {
  private apiKey: string;
  private agentId: string;

  constructor(
    private configService: ConfigService,
    private translationService: TranslationService,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
  ) {
    this.apiKey = this.configService.get<string>('ELEVENLABS_API_KEY') || '';
    this.agentId = this.configService.get<string>('ELEVENLABS_AGENT_ID') || '';

    if (!this.agentId) {
      console.warn('[TranslationAgent] No ELEVENLABS_AGENT_ID configured — will create agent on first use');
    }
  }

  /**
   * OpenAI-compatible chat completion endpoint.
   * ElevenLabs Conversational AI sends the user's transcript here.
   * We translate it and forward to the other user via Socket.IO.
   */
  @Post('chat/completions')
  async handleChatCompletion(
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      const messages = body.messages || [];

      // Extract context from system message (callId, userId, otherUserId, targetLanguage)
      const systemMsg = messages.find((m: any) => m.role === 'system');
      const context = this.parseContext(systemMsg?.content || '');

      // Extract user's transcript from the last user message
      const userMessages = messages.filter((m: any) => m.role === 'user');
      const lastUserMsg = userMessages[userMessages.length - 1];
      const transcript = lastUserMsg?.content?.trim();

      if (!transcript || !context.callId || !context.otherUserId) {
        console.log('[TranslationAgent] Missing transcript or context, returning empty');
        return res.json(this.buildResponse('.'));
      }

      console.log(`[TranslationAgent] Transcript from ${context.userId}: "${transcript}" → target: ${context.targetLanguage}`);

      // Skip very short transcripts
      if (transcript.length < 2) {
        return res.json(this.buildResponse('.'));
      }

      // Translate the transcript
      const targetLang = context.targetLanguage || 'en';
      let translatedText = transcript;

      try {
        const result = await this.translationService.translateText(transcript, targetLang);
        translatedText = result.translatedText;
        console.log(`[TranslationAgent] Translated: "${transcript}" → "${translatedText}" (${targetLang})`);
      } catch (err: any) {
        console.error('[TranslationAgent] Translation failed:', err.message);
      }

      // Generate TTS audio for the translated text
      let audioBase64: string | undefined;
      try {
        const audioBuffer = await this.translationService.textToSpeech(translatedText, targetLang);
        audioBase64 = audioBuffer.toString('base64');
      } catch (ttsErr: any) {
        console.error('[TranslationAgent] TTS failed:', ttsErr.message);
      }

      // Send translated text + audio to the OTHER user via Socket.IO
      this.eventsGateway.emitTranslatedText(
        context.otherUserId,
        context.callId,
        transcript,
        translatedText,
        targetLang,
        context.userId,
        audioBase64,
      );

      // Return minimal response — agent stays quiet (no TTS back to speaker)
      return res.json(this.buildResponse('.'));
    } catch (err: any) {
      console.error('[TranslationAgent] Error:', err);
      return res.status(HttpStatus.OK).json(this.buildResponse('.'));
    }
  }

  /**
   * Generate a short-lived conversation token for WebRTC connection.
   * Client calls this before connecting to the ElevenLabs agent.
   */
  @Get('conversation-token')
  async getConversationToken(
    @Query('callId') callId: string,
    @Query('userId') userId: string,
    @Query('otherUserId') otherUserId: string,
    @Query('targetLanguage') targetLanguage: string,
    @Res() res: Response,
  ) {
    if (!this.apiKey) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: 'ElevenLabs API key not configured',
      });
    }

    // Ensure we have an agent ID (create one if needed)
    if (!this.agentId) {
      try {
        this.agentId = await this.createTranslationAgent();
        console.log('[TranslationAgent] Created agent:', this.agentId);
      } catch (err: any) {
        console.error('[TranslationAgent] Failed to create agent:', err.message);
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          error: 'Failed to create translation agent',
        });
      }
    }

    try {
      // Get a signed conversation token from ElevenLabs
      const token = await this.fetchConversationToken(this.agentId);

      // Build the system prompt with call context
      const systemPrompt = this.buildSystemPrompt(callId, userId, otherUserId, targetLanguage);

      return res.json({
        token,
        agentId: this.agentId,
        systemPrompt,
        callId,
        targetLanguage,
      });
    } catch (err: any) {
      console.error('[TranslationAgent] Token fetch failed:', err.message);
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: 'Failed to get conversation token',
      });
    }
  }

  /**
   * Get the agent ID (creates one if needed).
   */
  @Get('agent-id')
  async getAgentId(@Res() res: Response) {
    if (!this.agentId) {
      try {
        this.agentId = await this.createTranslationAgent();
      } catch (err: any) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ error: err.message });
      }
    }
    return res.json({ agentId: this.agentId });
  }

  /** Parse context from the system prompt */
  private parseContext(systemContent: string): {
    callId: string;
    userId: string;
    otherUserId: string;
    targetLanguage: string;
  } {
    const match = systemContent.match(
      /CONTEXT:\s*callId=([^,]+),\s*userId=([^,]+),\s*otherUserId=([^,]+),\s*targetLanguage=(\S+)/,
    );
    if (match) {
      return {
        callId: match[1],
        userId: match[2],
        otherUserId: match[3],
        targetLanguage: match[4],
      };
    }
    return { callId: '', userId: '', otherUserId: '', targetLanguage: 'en' };
  }

  /** Build an OpenAI-format response */
  private buildResponse(content: string) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'translation-agent',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  /** Build system prompt with call context for the agent */
  private buildSystemPrompt(
    callId: string,
    userId: string,
    otherUserId: string,
    targetLanguage: string,
  ): string {
    return `CONTEXT: callId=${callId}, userId=${userId}, otherUserId=${otherUserId}, targetLanguage=${targetLanguage}

You are a silent translation relay. When the user speaks, you receive their speech as text.
Your response will be processed by the server. Always respond with exactly one period: "."
Do NOT speak, translate, or add any text. Just respond with ".".`;
  }

  /** Fetch a conversation token from ElevenLabs API */
  private fetchConversationToken(agentId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`;
      const req = https.request(
        url,
        {
          method: 'GET',
          headers: { 'xi-api-key': this.apiKey },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Token fetch failed (${res.statusCode}): ${body}`));
              return;
            }
            try {
              const data = JSON.parse(body);
              resolve(data.signed_url || data.token || data.url);
            } catch {
              reject(new Error('Failed to parse token response'));
            }
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  /** Create a translation agent via ElevenLabs API */
  private createTranslationAgent(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Get the server's public URL for the Custom LLM webhook
      const serverUrl = this.configService.get<string>('SERVER_URL') || 'http://localhost:3000';

      console.log(`[TranslationAgent] Creating agent with Custom LLM URL: ${serverUrl}/api/translation-agent/chat/completions`);

      const agentConfig = JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              prompt: 'You are a silent translation relay. Always respond with exactly one period: "."',
              llm: 'custom-llm',
              custom_llm: {
                url: `${serverUrl}/api/translation-agent/chat/completions`,
              },
              temperature: 0,
              max_tokens: 10,
            },
            first_message: '',
            language: 'en',
          },
          asr: {
            quality: 'high',
            provider: 'elevenlabs',
          },
          tts: {
            model_id: 'eleven_turbo_v2',
            voice_id: this.configService.get<string>('ELEVENLABS_VOICE_ID') || 'JBFqnCBsd6RMkjVDRZzb',
            optimize_streaming_latency: 4,
          },
          conversation: {
            max_duration_seconds: 3600,
          },
        },
        platform_settings: {
          auth: {
            enable_auth: false,
          },
        },
        name: 'MSG Translation Agent',
      });

      const req = https.request(
        'https://api.elevenlabs.io/v1/convai/agents/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              console.error('[TranslationAgent] Agent creation failed:', res.statusCode, body);
              reject(new Error(`Agent creation failed (${res.statusCode}): ${body}`));
              return;
            }
            try {
              const data = JSON.parse(body);
              const agentId = data.agent_id;
              if (!agentId) {
                reject(new Error('No agent_id in response'));
                return;
              }
              resolve(agentId);
            } catch {
              reject(new Error('Failed to parse agent creation response'));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(agentConfig);
      req.end();
    });
  }
}
