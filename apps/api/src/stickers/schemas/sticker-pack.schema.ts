import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StickerPackDocument = StickerPack & Document;

@Schema({ _id: false })
export class Sticker {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop()
  emoji?: string;
}

const StickerSchema = SchemaFactory.createForClass(Sticker);

@Schema({ timestamps: true })
export class StickerPack {
  @Prop({ required: true })
  name: string;

  @Prop()
  publisher?: string;

  @Prop()
  iconUrl?: string;

  @Prop({ type: [StickerSchema], default: [] })
  stickers: Sticker[];

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: 0 })
  downloadCount: number;
}

export const StickerPackSchema = SchemaFactory.createForClass(StickerPack);
