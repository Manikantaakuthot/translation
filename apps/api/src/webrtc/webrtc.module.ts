import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebRtcController } from './webrtc.controller';

@Module({
  imports: [ConfigModule],
  controllers: [WebRtcController],
})
export class WebRtcModule {}
