import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ _id: false })
export class DeliveryStatus {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ default: Date.now })
  at: Date;
}

const DeliveryStatusSchema = SchemaFactory.createForClass(DeliveryStatus);

@Schema({ _id: false })
export class MessageStatus {
  @Prop({ type: Date, default: Date.now })
  sent?: Date;

  @Prop({ type: [DeliveryStatusSchema], default: [] })
  delivered?: DeliveryStatus[];

  @Prop({ type: [DeliveryStatusSchema], default: [] })
  read?: DeliveryStatus[];
}

const MessageStatusSchema = SchemaFactory.createForClass(MessageStatus);

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true, enum: ['text', 'image', 'video', 'audio', 'document', 'voice', 'location', 'contact', 'poll', 'sticker'] })
  type: string;

  @Prop()
  content: string;

  @Prop()
  mediaUrl?: string;

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  replyToMessageId?: Types.ObjectId;

  @Prop({ type: MessageStatusSchema, default: () => ({}) })
  status?: MessageStatus;

  @Prop({ type: Map, of: String, default: {} })
  reactions: Map<string, string>;

  @Prop({ default: false })
  isDeleted: boolean;

  /** IDs of users who deleted this message "for themselves" only */
  @Prop({ type: [String], default: [] })
  deletedFor: string[];

  /** Per-user starred (WhatsApp-like). */
  @Prop({ type: [String], default: [] })
  starredBy: string[];

  /** Per-user pinned (WhatsApp-like). Limit enforcement happens in service layer. */
  @Prop({ type: [String], default: [] })
  pinnedBy: string[];

  @Prop()
  detectedLanguage?: string;

  @Prop({ type: Map, of: String, default: {} })
  translations: Map<string, string>;

  // Link Preview
  @Prop({ type: Object })
  linkPreview?: { url: string; title: string; description: string; image?: string };

  // Message Edit
  @Prop({ default: false })
  isEdited: boolean;

  @Prop()
  editedAt?: Date;

  // Disappearing Messages
  @Prop()
  expiresAt?: Date;

  // View Once Media
  @Prop({ default: false })
  isViewOnce: boolean;

  @Prop({ type: [String], default: [] })
  viewedBy: string[];

  // @ Mentions
  @Prop({ type: [String], default: [] })
  mentions: string[];

  // Contact Card
  @Prop({ type: Object })
  sharedContact?: { name: string; phone: string; email?: string; avatar?: string };

  // Poll
  @Prop({ type: Object })
  poll?: {
    question: string;
    options: { text: string; voters: string[] }[];
    allowMultiple: boolean;
  };

  // Location details
  @Prop({ type: Object })
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    isLive?: boolean;
    liveDuration?: number; // minutes
    expiresAt?: string;
    updatedAt?: string;
  };
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ content: 'text' });
MessageSchema.index({ conversationId: 1, pinnedBy: 1 });
MessageSchema.index({ conversationId: 1, starredBy: 1 });
// TTL index for disappearing messages — MongoDB auto-deletes when expiresAt passes
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
