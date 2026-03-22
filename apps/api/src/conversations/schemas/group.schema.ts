import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GroupDocument = Group & Document;

@Schema({ timestamps: true })
export class Group {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, unique: true })
  conversationId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  iconUrl?: string;

  @Prop()
  inviteCode?: string;

  @Prop({ default: false })
  inviteEnabled: boolean;
}

export const GroupSchema = SchemaFactory.createForClass(Group);
