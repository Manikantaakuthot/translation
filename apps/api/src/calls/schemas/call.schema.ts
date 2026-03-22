import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallDocument = Call & Document;

@Schema({ timestamps: true })
export class Call {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  callerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  calleeId: Types.ObjectId;

  @Prop({ required: true, enum: ['voice', 'video'] })
  type: string;

  @Prop({ default: 'ringing', enum: ['ringing', 'answered', 'rejected', 'ended', 'missed'] })
  status: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  duration?: number;
}

export const CallSchema = SchemaFactory.createForClass(Call);
CallSchema.index({ callerId: 1, createdAt: -1 });
CallSchema.index({ calleeId: 1, createdAt: -1 });
