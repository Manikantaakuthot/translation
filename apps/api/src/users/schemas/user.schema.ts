import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  phone: string;

  @Prop({ required: true })
  countryCode: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  profilePictureUrl?: string;

  @Prop({ maxlength: 139 })
  statusText?: string;

  @Prop()
  lastSeen?: Date;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop()
  passwordHash?: string;

  @Prop()
  totpSecret?: string;

  @Prop({ default: false })
  totpEnabled: boolean;

  @Prop({ default: 'en' })
  preferredLanguage: string;

  @Prop({ default: false })
  autoTranslateMessages: boolean;

  @Prop({ default: false })
  autoTranslateCalls: boolean;

  /** True for placeholder accounts created by findOrCreateByPhone before the person registers */
  @Prop({ default: false })
  isGuest: boolean;

  // Privacy settings
  @Prop({ default: 'contacts', enum: ['everyone', 'contacts', 'nobody'] })
  lastSeenPrivacy: string;

  @Prop({ default: 'contacts', enum: ['everyone', 'contacts', 'nobody'] })
  profilePhotoPrivacy: string;

  @Prop({ default: 'contacts', enum: ['everyone', 'contacts', 'nobody'] })
  aboutPrivacy: string;

  @Prop({ default: 'contacts', enum: ['everyone', 'contacts', 'nobody'] })
  statusPrivacy: string;

  @Prop({ default: true })
  readReceipts: boolean;

  // Notification preferences
  @Prop({ default: true })
  notifyMessages: boolean;

  @Prop({ default: true })
  notifyCalls: boolean;

  @Prop({ default: true })
  notifyGroups: boolean;

  @Prop({ default: 'default' })
  notificationTone: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ phone: 1 });
UserSchema.index({ name: 'text' });
