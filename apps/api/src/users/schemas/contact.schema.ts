import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContactDocument = Contact & Document;

@Schema({ timestamps: true })
export class Contact {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  contactUserId: Types.ObjectId;

  @Prop()
  displayName?: string;

  @Prop({ default: false })
  isBlocked: boolean;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

ContactSchema.index({ userId: 1, contactUserId: 1 }, { unique: true });
