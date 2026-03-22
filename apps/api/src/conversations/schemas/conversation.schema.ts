import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class ConversationParticipant {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ default: 'member' })
  role: string;

  @Prop({ default: false })
  isMuted: boolean;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop({ default: Date.now })
  joinedAt: Date;
}

const ParticipantSchema = SchemaFactory.createForClass(ConversationParticipant);

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true, enum: ['direct', 'group', 'broadcast'] })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: [ParticipantSchema], default: [] })
  participants: ConversationParticipant[];

  @Prop()
  name?: string;

  @Prop()
  groupPictureUrl?: string;

  // Disappearing messages duration in ms (0 = off, 86400000 = 24h, 604800000 = 7d, 7776000000 = 90d)
  @Prop({ default: 0 })
  disappearingDuration: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ type: 1 });
ConversationSchema.index({ 'participants.userId': 1 });
