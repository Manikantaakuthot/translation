import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StatusDocument = Status & Document;

@Schema({ timestamps: true })
export class Status {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['text', 'image', 'video'] })
  type: string;

  @Prop()
  content?: string;

  @Prop()
  mediaUrl?: string;

  @Prop({ default: '' })
  backgroundColor: string;

  @Prop({ default: Date.now })
  expiresAt: Date;

  @Prop({
    type: [{ userId: { type: Types.ObjectId, ref: 'User' }, viewedAt: Date }],
    default: [],
  })
  viewers: { userId: Types.ObjectId; viewedAt: Date }[];
}

export const StatusSchema = SchemaFactory.createForClass(Status);
StatusSchema.index({ userId: 1, createdAt: -1 });
// TTL index: MongoDB auto-deletes when expiresAt passes
StatusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
