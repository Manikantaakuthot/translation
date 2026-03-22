import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';
import { StickerPack, StickerPackSchema } from './schemas/sticker-pack.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StickerPack.name, schema: StickerPackSchema },
    ]),
  ],
  controllers: [StickersController],
  providers: [StickersService],
  exports: [StickersService],
})
export class StickersModule {}
