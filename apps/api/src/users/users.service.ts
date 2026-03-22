import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { randomInt } from 'crypto';
import { User, UserDocument } from './schemas/user.schema';
import { Contact, ContactDocument } from './schemas/contact.schema';
import { PhoneReverseIndex, PhoneReverseIndexDocument } from './schemas/phone-reverse-index.schema';
import { AuthService } from '../auth/auth.service';
import { PushService } from '../push/push.service';
import { Conversation } from '../conversations/schemas/conversation.schema';
import { Message } from '../messages/schemas/message.schema';
import { Call } from '../calls/schemas/call.schema';
import { Status } from '../status/schemas/status.schema';

/** Strip whitespace and leading + so +91628… and 91628… and 628… all normalize the same way */
function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^\+/, '');
}

/** Build full phone: countryCode digits + local number, e.g. "+91" + "6281516349" → "916281516349" */
function buildFullPhone(phone: string, countryCode?: string): string {
  const stripped = normalizePhone(phone);
  if (!countryCode) return stripped;
  const cc = normalizePhone(countryCode);
  if (!cc) return stripped; // empty string after normalization (e.g. countryCode was "" or "+")
  if (stripped.startsWith(cc)) return stripped;
  return cc + stripped;
}

/** Find user by phone, trying multiple formats to handle legacy stored data */
async function findUserByPhoneFlexible(
  userModel: any,
  phone: string,
  countryCode?: string,
): Promise<any> {
  const stripped = normalizePhone(phone);
  const full = countryCode ? buildFullPhone(phone, countryCode) : stripped;
  const conditions: any[] = [
    { phone: stripped },
    { phone: `+${stripped}` },
    { phone: full },
    { phone: `+${full}` },
  ];
  // suffix match for local-only numbers (≤10 digits)
  if (stripped.length >= 7 && stripped.length <= 10) {
    conditions.push({ phone: { $regex: new RegExp(`${stripped}$`) } });
  }
  // For international numbers (>10 digits), also try suffix on local part (last 10 digits)
  // so "919849394249" also finds "9849394249" stored without country code
  if (full.length > 10) {
    const localPart = full.slice(-10);
    conditions.push({ phone: { $regex: new RegExp(`${localPart}$`) } });
  }
  return userModel.findOne({ $or: conditions });
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Contact.name) private contactModel: Model<ContactDocument>,
    @InjectModel(PhoneReverseIndex.name) private phoneReverseIndexModel: Model<PhoneReverseIndexDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<any>,
    @InjectModel(Message.name) private messageModel: Model<any>,
    @InjectModel(Call.name) private callModel: Model<any>,
    @InjectModel(Status.name) private statusModel: Model<any>,
    private authService: AuthService,
    private pushService: PushService,
  ) {}

  async getMe(user: UserDocument) {
    return this.authService.sanitizeUser(user);
  }

  async updateMe(userId: string, updates: { name?: string; statusText?: string; profilePictureUrl?: string }) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updates, updatedAt: new Date() },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return this.authService.sanitizeUser(user);
  }

  async updateLanguagePreference(
    userId: string,
    preferredLanguage: string,
    autoTranslateMessages: boolean,
    autoTranslateCalls: boolean,
  ) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { preferredLanguage, autoTranslateMessages, autoTranslateCalls },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return this.authService.sanitizeUser(user);
  }

  async searchUsers(query: string, excludeUserId: string) {
    // Escape regex metacharacters so queries like "+18596483432" don't throw MongoDB errors
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await this.userModel
      .find({
        _id: { $ne: excludeUserId },
        // Exclude ghost accounts:
        //  - New ghosts: isGuest: true (set by updated code)
        //  - Old ghosts: isGuest field missing + lastSeen null (created before isGuest was added)
        $nor: [
          { isGuest: true },
          { isGuest: { $exists: false }, lastSeen: null },
        ],
        $or: [
          { name: { $regex: escapedQuery, $options: 'i' } },
          { phone: { $regex: normalizePhone(query), $options: 'i' } },
        ],
      })
      .limit(20)
      .select('-passwordHash')
      .lean();
    return users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      phone: u.phone,
      profilePictureUrl: u.profilePictureUrl,
      statusText: u.statusText,
    }));
  }

  async getUserById(id: string) {
    const user = await this.userModel.findById(id).select('-passwordHash').lean();
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user._id.toString(),
      name: user.name,
      phone: user.phone,
      profilePictureUrl: user.profilePictureUrl,
      statusText: user.statusText,
      lastSeen: user.lastSeen,
      isOnline: user.isOnline,
    };
  }

  async getContacts(userId: string) {
    const contacts = await this.contactModel
      .find({ userId: new Types.ObjectId(userId), isBlocked: false })
      .populate('contactUserId', 'name phone profilePictureUrl statusText lastSeen isOnline')
      .lean();
    return contacts
      .filter((c: any) => c.contactUserId != null)
      .map((c: any) => ({
        id: c.contactUserId._id.toString(),
        displayName: c.displayName || c.contactUserId.name,
        name: c.contactUserId.name,
        phone: c.contactUserId.phone,
        profilePictureUrl: c.contactUserId.profilePictureUrl,
        statusText: c.contactUserId.statusText,
        lastSeen: c.contactUserId.lastSeen,
        isOnline: c.contactUserId.isOnline,
      }));
  }

  async findOrCreateByPhone(
    currentUserId: string,
    phone: string,
    name: string,
    countryCode: string,
  ) {
    if (!phone || !name) {
      throw new BadRequestException('Phone and name are required');
    }
    const fullPhone = buildFullPhone(phone, countryCode);
    // Find existing user by phone — try multiple formats to handle legacy data
    let user = await findUserByPhoneFlexible(this.userModel, phone, countryCode);
    if (!user) {
      // No registered user found — create a ghost placeholder that will be upgraded when they register
      console.log(`[Users] findOrCreateByPhone: no user found for phone="${phone}" cc="${countryCode}" (full="${fullPhone}") — creating ghost`);
      const passwordHash = await bcrypt.hash(randomInt(1e12).toString(), 10);
      user = await this.userModel.create({
        phone: fullPhone, // store full normalized phone
        countryCode,
        name,
        passwordHash,
        isGuest: true, // Mark as guest so it can be upgraded when they register
      });
      console.log(`[Users] findOrCreateByPhone: ghost created id=${user._id}`);
    } else if ((user as any).isGuest) {
      // Guest exists — refresh display name (contact may have a more accurate name)
      console.log(`[Users] findOrCreateByPhone: found existing ghost id=${user._id}, refreshing name`);
      user.name = name;
      await user.save();
    } else {
      console.log(`[Users] findOrCreateByPhone: found real user id=${user._id} phone="${user.phone}"`);
    }
    const newUserId = user._id.toString();
    if (newUserId === currentUserId) {
      throw new ForbiddenException('Cannot add yourself as contact');
    }
    // Auto-add as contact
    await this.contactModel.findOneAndUpdate(
      { userId: new Types.ObjectId(currentUserId), contactUserId: user._id },
      { displayName: name, isBlocked: false },
      { upsert: true, new: true },
    );
    return {
      id: newUserId,
      name: user.name,
      phone: user.phone,
      profilePictureUrl: user.profilePictureUrl,
      statusText: user.statusText,
    };
  }

  async addContact(userId: string, contactUserId: string, displayName?: string) {
    if (userId === contactUserId) {
      throw new ForbiddenException('Cannot add yourself as contact');
    }
    const contactUser = await this.userModel.findById(contactUserId);
    if (!contactUser) {
      throw new NotFoundException('User not found');
    }
    const contact = await this.contactModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), contactUserId: new Types.ObjectId(contactUserId) },
      { displayName, isBlocked: false },
      { upsert: true, new: true },
    )
      .populate('contactUserId', 'name phone profilePictureUrl statusText lastSeen isOnline')
      .lean();
    const c = contact as any;
    return {
      id: c.contactUserId._id.toString(),
      displayName: c.displayName || c.contactUserId.name,
      name: c.contactUserId.name,
      phone: c.contactUserId.phone,
      profilePictureUrl: c.contactUserId.profilePictureUrl,
      statusText: c.contactUserId.statusText,
      lastSeen: c.contactUserId.lastSeen,
      isOnline: c.contactUserId.isOnline,
    };
  }

  async removeContact(userId: string, contactUserId: string) {
    await this.contactModel.deleteOne({
      userId: new Types.ObjectId(userId),
      contactUserId: new Types.ObjectId(contactUserId),
    });
    return { success: true };
  }

  async blockContact(userId: string, contactUserId: string) {
    await this.contactModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), contactUserId: new Types.ObjectId(contactUserId) },
      { isBlocked: true },
      { upsert: true, new: true },
    );
    return { success: true, blocked: true };
  }

  async unblockContact(userId: string, contactUserId: string) {
    await this.contactModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), contactUserId: new Types.ObjectId(contactUserId) },
      { isBlocked: false },
    );
    return { success: true, blocked: false };
  }

  async getCommonGroups(userId: string, otherUserId: string) {
    const uid1 = new Types.ObjectId(userId);
    const uid2 = new Types.ObjectId(otherUserId);
    const groups = await this.conversationModel
      .find({
        type: 'group',
        'participants.userId': { $all: [uid1, uid2] },
      })
      .select('_id name participants')
      .lean();
    return groups.map((g: any) => ({
      id: g._id.toString(),
      name: g.name || 'Group',
      participantCount: g.participants?.length || 0,
    }));
  }

  async exportUserData(userId: string) {
    const user = await this.userModel.findById(userId).select('-passwordHash -totpSecret').lean();
    if (!user) throw new NotFoundException('User not found');
    const contacts = await this.contactModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('contactUserId', 'name phone')
      .lean();
    const convs = await this.conversationModel
      .find({ 'participants.userId': new Types.ObjectId(userId) })
      .lean();
    const convIds = convs.map((c: any) => c._id);
    const messages = await this.messageModel
      .find({ senderId: new Types.ObjectId(userId) })
      .select('content type createdAt conversationId')
      .limit(10000)
      .lean();
    const calls = await this.callModel
      .find({ $or: [{ callerId: new Types.ObjectId(userId) }, { calleeId: new Types.ObjectId(userId) }] })
      .lean();
    const statuses = await this.statusModel.find({ userId: new Types.ObjectId(userId) }).lean();
    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: (user as any)._id.toString(),
        phone: (user as any).phone,
        name: (user as any).name,
        profilePictureUrl: (user as any).profilePictureUrl,
        statusText: (user as any).statusText,
      },
      contacts: contacts.map((c: any) => ({
        displayName: c.displayName,
        contact: c.contactUserId ? { name: c.contactUserId.name, phone: c.contactUserId.phone } : null,
      })),
      conversationsCount: convs.length,
      messagesCount: messages.length,
      messages: messages.map((m: any) => ({
        content: m.content,
        type: m.type,
        createdAt: m.createdAt,
      })),
      callsCount: calls.length,
      statusesCount: statuses.length,
    };
  }

  async syncPhoneContacts(userId: string, phones: string[]): Promise<{
    matched: { id: string; name: string; phone: string; profilePictureUrl?: string }[];
  }> {
    if (!Array.isArray(phones) || phones.length === 0) return { matched: [] };

    // 1. Deduplicate and cap at 1000
    const unique = [...new Set(phones.map((p) => normalizePhone(String(p))))].slice(0, 1000);

    // 2. Build OR conditions — each number may be stored in any format
    const orConditions: any[] = [];
    for (const stripped of unique) {
      orConditions.push({ phone: stripped });
      orConditions.push({ phone: `+${stripped}` });
      if (stripped.length > 10) {
        const localPart = stripped.slice(-10);
        orConditions.push({ phone: { $regex: new RegExp(`${localPart}$`) } });
      } else if (stripped.length >= 7) {
        orConditions.push({ phone: { $regex: new RegExp(`${stripped}$`) } });
      }
    }

    // 3. Find real (non-ghost) users matching any of the provided numbers
    const uid = new Types.ObjectId(userId);
    const matched = await this.userModel
      .find({
        _id: { $ne: uid },
        isGuest: { $ne: true },
        $or: orConditions,
      })
      .select('_id name phone profilePictureUrl')
      .lean();

    // 4. Upsert reverse index: record that this user has each number in their contacts
    await Promise.all(
      unique.map((stripped) => {
        const phoneHash = createHash('sha256').update(stripped).digest('hex');
        return this.phoneReverseIndexModel.findOneAndUpdate(
          { phoneHash },
          { $addToSet: { syncedBy: uid } },
          { upsert: true, new: true },
        );
      }),
    );

    return {
      matched: matched.map((u: any) => ({
        id: u._id.toString(),
        name: u.name,
        phone: u.phone,
        profilePictureUrl: u.profilePictureUrl,
      })),
    };
  }

  async updatePrivacy(userId: string, data: any) {
    const allowed = ['lastSeenPrivacy', 'profilePhotoPrivacy', 'aboutPrivacy', 'statusPrivacy', 'readReceipts'];
    const update: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    return this.userModel.findByIdAndUpdate(userId, update, { new: true }).select('-passwordHash -totpSecret');
  }

  async updateNotifications(userId: string, data: any) {
    const allowed = ['notifyMessages', 'notifyCalls', 'notifyGroups', 'notificationTone'];
    const update: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    return this.userModel.findByIdAndUpdate(userId, update, { new: true }).select('-passwordHash -totpSecret');
  }

  async deleteAccount(userId: string) {
    const uid = new Types.ObjectId(userId);
    await this.contactModel.deleteMany({ userId: uid });
    await this.contactModel.deleteMany({ contactUserId: uid });
    const convs = await this.conversationModel.find({ 'participants.userId': uid }).lean();
    for (const c of convs) {
      const participants = (c as any).participants.filter((p: any) => p.userId.toString() !== userId);
      if (participants.length === 0) {
        await this.conversationModel.deleteOne({ _id: (c as any)._id });
        await this.messageModel.deleteMany({ conversationId: (c as any)._id });
      } else {
        await this.conversationModel.updateOne(
          { _id: (c as any)._id },
          { $pull: { participants: { userId: uid } } },
        );
      }
    }
    await this.messageModel.updateMany({ senderId: uid }, { $set: { isDeleted: true, content: '[Deleted]' } });
    await this.callModel.deleteMany({ $or: [{ callerId: uid }, { calleeId: uid }] });
    await this.statusModel.deleteMany({ userId: uid });
    await this.userModel.deleteOne({ _id: uid });
    return { success: true };
  }
}
