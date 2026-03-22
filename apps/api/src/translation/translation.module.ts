import { Module, forwardRef } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import { TranslationAgentController } from './translation-agent.controller';
import { LibreTranslateProvider } from './providers/libre-translate.provider';
import { ElevenLabsService } from './elevenlabs.service';
import { WhisperSttService } from './whisper-stt.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [forwardRef(() => EventsModule)],
  controllers: [TranslationController, TranslationAgentController],
  providers: [TranslationService, LibreTranslateProvider, ElevenLabsService, WhisperSttService],
  exports: [TranslationService, ElevenLabsService, WhisperSttService],
})
export class TranslationModule {}
