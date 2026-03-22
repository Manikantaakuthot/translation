import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelDocument = Channel & Document;

@Schema({ _id: false })
export class ChannelSubscriber {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ default: false })
  isMuted: boolean;

  @Prop({ default: Date.now })
  joinedAt: Date;
}

const ChannelSubscriberSchema = SchemaFactory.createForClass(ChannelSubscriber);

@Schema({ timestamps: true })
export class Channel {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  iconUrl?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[];

  @Prop({ type: [ChannelSubscriberSchema], default: [] })
  subscribers: ChannelSubscriber[];

  @Prop()
  inviteCode?: string;

  @Prop({ default: true })
  inviteEnabled: boolean;

  @Prop({ default: 0 })
  subscriberCount: number;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);

ChannelSchema.index({ name: 'text' });
ChannelSchema.index({ inviteCode: 1 }, { sparse: true });
