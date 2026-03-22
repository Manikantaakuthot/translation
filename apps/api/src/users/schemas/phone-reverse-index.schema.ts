import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PhoneReverseIndexDocument = PhoneReverseIndex & Document;

/**
 * Stores which app users have a given phone number saved in their device contacts.
 * Used to send "Friend just joined MSG!" push notifications on new registrations.
 *
 * Privacy: only SHA-256 hashes of phone numbers are stored — never plaintext numbers.
 */
@Schema({ timestamps: true })
export class PhoneReverseIndex {
  /** SHA-256 hex hash of the normalised phone number */
  @Prop({ required: true, unique: true })
  phoneHash: string;

  /** User IDs who have this phone number saved in their device contact list */
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  syncedBy: Types.ObjectId[];
}

export const PhoneReverseIndexSchema = SchemaFactory.createForClass(PhoneReverseIndex);
PhoneReverseIndexSchema.index({ phoneHash: 1 }, { unique: true });
PhoneReverseIndexSchema.index({ syncedBy: 1 });
