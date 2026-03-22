import { Module } from '@nestjs/common';
import { GifController } from './gif.controller';
import { GifService } from './gif.service';

@Module({
  controllers: [GifController],
  providers: [GifService],
  exports: [GifService],
})
export class GifModule {}
