import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PushSubscriptionDocument = PushSubscription & Document;

@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop()
  endpoint: string;

  @Prop({ type: Object })
  keys?: { p256dh?: string; auth?: string };

  @Prop()
  fcmToken?: string;

  @Prop({ default: 'web' })
  platform: string;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription);
PushSubscriptionSchema.index({ userId: 1 });
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true, sparse: true });
