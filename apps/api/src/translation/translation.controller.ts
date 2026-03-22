import { Controller, Post, Get, Body, UseGuards, Res, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TranslationService } from './translation.service';
import { TranslateDto } from './dto/translate.dto';
import { TtsDto } from './dto/tts.dto';

@Controller('translation')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(private translationService: TranslationService) {}

  @Post('translate')
  async translate(@Body() dto: TranslateDto) {
    return this.translationService.translateText(
      dto.text,
      dto.targetLanguage,
      dto.sourceLanguage,
    );
  }

  @Post('tts')
  async textToSpeech(@Body() dto: TtsDto, @Res() res: Response) {
    try {
      console.log(`[TTS Controller] Request: text="${dto.text?.substring(0, 50)}", language="${dto.language}"`);
      const audioBuffer = await this.translationService.textToSpeech(dto.text, dto.language);
      console.log(`[TTS Controller] Generated ${audioBuffer.length} bytes of audio`);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Cache-Control': 'no-cache',
      });
      res.end(audioBuffer);
    } catch (error: any) {
      console.error('[TTS Controller] Error:', error.message);
      res.status(500).json({ message: error.message || 'TTS generation failed' });
    }
  }

  @Post('detect')
  async detect(@Body() body: { text: string }) {
    const language = await this.translationService.detectLanguage(body.text);
    return { language };
  }

  @Get('languages')
  getSupportedLanguages() {
    return { languages: this.translationService.getSupportedLanguages() };
  }
}
