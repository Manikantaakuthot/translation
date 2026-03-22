import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeviceSessionDocument = DeviceSession & Document;

@Schema({ timestamps: true })
export class DeviceSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  deviceName: string;

  @Prop({ required: true, enum: ['web', 'desktop', 'mobile', 'tablet'] })
  deviceType: string;

  @Prop()
  browser?: string;

  @Prop()
  os?: string;

  @Prop()
  ip?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: Date.now })
  lastActive: Date;

  @Prop()
  linkedAt: Date;

  @Prop()
  unlinkedAt?: Date;

  /** SHA-256 hash of current refresh token for this device session (rotation supported). */
  @Prop()
  refreshTokenHash?: string;

  @Prop()
  refreshTokenExpiresAt?: Date;

  /** If set, the session is revoked and cannot refresh tokens. */
  @Prop()
  revokedAt?: Date;
}

export const DeviceSessionSchema = SchemaFactory.createForClass(DeviceSession);

DeviceSessionSchema.index({ userId: 1 });
DeviceSessionSchema.index({ userId: 1, isActive: 1 });
DeviceSessionSchema.index({ refreshTokenHash: 1 });
