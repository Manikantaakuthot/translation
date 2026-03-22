import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { Conversation, ConversationDocument } from '../conversations/schemas/conversation.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { EventsGateway } from '../events/events.gateway';
import { TranslationService } from '../translation/translation.service';
import { PushService } from '../push/push.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private eventsGateway: EventsGateway,
    private translationService: TranslationService,
    private pushService: PushService,
  ) {}

  async create(userId: string, dto: CreateMessageDto) {
    const conv = await this.conversationModel.findById(dto.conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    // Calculate expiresAt for disappearing messages
    let expiresAt: Date | undefined;
    if ((conv as any).disappearingDuration > 0) {
      expiresAt = new Date(Date.now() + (conv as any).disappearingDuration);
    }

    const msg = await this.messageModel.create({
      conversationId: new Types.ObjectId(dto.conversationId),
      senderId: new Types.ObjectId(userId),
      type: dto.type,
      content: dto.content || '',
      mediaUrl: dto.mediaUrl,
      replyToMessageId: dto.replyToMessageId ? new Types.ObjectId(dto.replyToMessageId) : undefined,
      status: { sent: new Date() },
      isViewOnce: dto.isViewOnce || false,
      mentions: dto.mentions || [],
      sharedContact: dto.sharedContact,
      poll: dto.poll,
      location: dto.location,
      expiresAt,
    });
    await this.conversationModel.updateOne({ _id: conv._id }, { updatedAt: new Date() });

    // Async: fetch link preview for text messages with URLs
    if (dto.type === 'text' && dto.content) {
      this.fetchLinkPreview(msg._id.toString(), dto.content).catch(() => {});
    }
    const formatted = this.formatMessage(msg, userId);
    // Look up sender name so real-time messages include it
    try {
      const sender = await this.conversationModel.db.model('User').findById(userId).select('name').lean();
      if (sender && (sender as any).name) {
        formatted.senderName = (sender as any).name;
      }
    } catch (err) {
      console.error('[Messages] Error looking up sender name:', err);
    }
    this.eventsGateway.emitNewMessage(formatted).catch((err) => {
      console.error('[Messages] Error emitting new message via socket:', err);
    });

    // Send FCM push notifications to offline participants (async, non-blocking)
    this.sendPushToOfflineParticipants(conv, userId, formatted).catch((err) => {
      console.error('[Messages] Error sending FCM notifications:', err);
    });

    return formatted;
  }

  // ── FCM: notify participants whose socket is offline ────────────────────────
  private async sendPushToOfflineParticipants(conv: any, senderId: string, msg: any) {
    const senderName = msg.senderName || 'Someone';
    const body = msg.type === 'text'
      ? (msg.content?.slice(0, 100) || '')
      : msg.type === 'image' ? '📷 Photo' : msg.type === 'video' ? '🎥 Video'
      : msg.type === 'audio' || msg.type === 'voice' ? '🎤 Voice message'
      : msg.type === 'document' ? '📄 Document'
      : msg.type === 'poll' ? '📊 Poll'
      : msg.type === 'location' ? '📍 Location' : '📎 Attachment';

    const participantIds = (conv.participants || []).map((p: any) => p.userId?.toString?.() ?? p.userId);
    await Promise.all(
      participantIds
        .filter((uid: string) => uid !== senderId)
        .map((uid: string) =>
          this.pushService.sendToUser(
            uid,
            { title: senderName, body },
            {
              conversationId: msg.conversationId,
              messageId: msg.id,
              senderId,
              type: 'new_message',
            },
          ),
        ),
    );
  }

  // ── Missed message sync: returns messages sent while user was offline ────────
  async getUnreadSince(userId: string, since: Date, limit = 200) {
    const convs = await this.conversationModel
      .find({ 'participants.userId': new Types.ObjectId(userId) })
      .select('_id')
      .lean();
    const convIds = convs.map((c: any) => c._id);
    const messages = await this.messageModel
      .find({
        conversationId: { $in: convIds },
        senderId: { $ne: new Types.ObjectId(userId) },
        isDeleted: false,
        createdAt: { $gte: since },
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .populate('senderId', 'name profilePictureUrl')
      .lean();
    return messages.map((m: any) => this.formatMessage(m, userId));
  }

  async search(userId: string, query: string, limit = 50) {
    if (!query.trim()) return [];
    const convs = await this.conversationModel.find({ 'participants.userId': new Types.ObjectId(userId) }).select('_id').lean();
    const convIds = convs.map((c: any) => c._id);
    const messages = await this.messageModel
      .find({
        conversationId: { $in: convIds },
        isDeleted: false,
        content: { $regex: query, $options: 'i' },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'name')
      .lean();
    return messages.map((m: any) => this.formatMessage(m, userId));
  }

  async findByConversation(conversationId: string, userId: string, limit = 50, before?: string) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    // Keep "deleted for everyone" messages visible as tombstones (WhatsApp-like),
    // but exclude messages privately deleted by this user.
    const query: any = {
      conversationId: new Types.ObjectId(conversationId),
      deletedFor: { $nin: [userId] },
    };
    if (before) {
      const beforeMsg = await this.messageModel.findById(before).lean();
      if (beforeMsg && (beforeMsg as any).createdAt) query.createdAt = { $lt: (beforeMsg as any).createdAt };
    }
    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'name profilePictureUrl')
      .populate({
        path: 'replyToMessageId',
        select: 'content type senderId mediaUrl isDeleted',
        populate: { path: 'senderId', select: 'name' },
      })
      .lean();
    return messages.reverse().map((m: any) => this.formatMessage(m, userId));
  }

  async markAsRead(messageIds: string[], userId: string, conversationId?: string) {
    if (messageIds.length === 0) return { success: true };
    const msgs = await this.messageModel.find({ _id: { $in: messageIds.map((id) => new Types.ObjectId(id)) } }).lean();
    await this.messageModel.updateMany(
      { _id: { $in: messageIds.map((id) => new Types.ObjectId(id)) } },
      { $addToSet: { 'status.read': { userId: new Types.ObjectId(userId), at: new Date() } } },
    );
    const convId = conversationId || msgs[0]?.conversationId?.toString();
    if (convId) {
      this.eventsGateway.emitMessageRead(messageIds, userId, convId).catch((err) => {
        console.error('[Messages] Error emitting message read via socket:', err);
      });
    }
    return { success: true };
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.messageModel.findById(messageId);
    if (!msg) throw new NotFoundException('Message not found');
    await this.messageModel.updateOne(
      { _id: msg._id },
      { $set: { [`reactions.${userId}`]: emoji } },
    );
    const updated = await this.messageModel.findById(messageId).lean();
    return this.formatMessage(updated, userId);
  }

  async delete(messageId: string, userId: string, deleteForEveryone = false) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException('Invalid message id');
    }
    const msg = await this.messageModel.findById(messageId);
    if (!msg) throw new NotFoundException('Message not found');

    if (deleteForEveryone) {
      // Only the sender can delete for everyone
      if (msg.senderId.toString() !== userId) throw new ForbiddenException('Can only delete your own messages for everyone');
      // WhatsApp-style: allow a longer delete-for-everyone window.
      // We use 48 hours to match common user expectation.
      const elapsed = Date.now() - new Date((msg as any).createdAt).getTime();
      const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;
      if (elapsed > DELETE_FOR_EVERYONE_WINDOW_MS) {
        throw new ForbiddenException('Delete for everyone is no longer available (time limit exceeded)');
      }
      await this.messageModel.updateOne(
        { _id: msg._id },
        {
          isDeleted: true,
          content: 'This message was deleted',
          mediaUrl: null,
          linkPreview: null,
        },
      );
      // Emit to all participants so their UI updates
      this.eventsGateway.emitMessageDelete(messageId, msg.conversationId.toString()).catch((err) => {
        console.error('[Messages] Error emitting message delete via socket:', err);
      });
    } else {
      // Delete for me: just add this user to the deletedFor array
      await this.messageModel.updateOne(
        { _id: msg._id },
        { $addToSet: { deletedFor: userId } },
      );
      // No need to broadcast — only affects this user's view
    }

    return { success: true, deleteForEveryone };
  }

  async forward(messageId: string, userId: string, targetConversationId: string) {
    const msg = await this.messageModel.findById(messageId).lean();
    if (!msg) throw new NotFoundException('Message not found');
    const conv = await this.conversationModel.findById(targetConversationId);
    if (!conv) throw new NotFoundException('Target conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant in target conversation');
    const newMsg = await this.messageModel.create({
      conversationId: new Types.ObjectId(targetConversationId),
      senderId: new Types.ObjectId(userId),
      type: (msg as any).type,
      content: (msg as any).content,
      mediaUrl: (msg as any).mediaUrl,
      status: { sent: new Date() },
    });
    await this.conversationModel.updateOne({ _id: conv._id }, { updatedAt: new Date() });
    const formatted = this.formatMessage(newMsg, userId);
    this.eventsGateway.emitNewMessage(formatted).catch((err) => {
      console.error('[Messages] Error emitting forwarded message via socket:', err);
    });
    return formatted;
  }

  async translateMessage(messageId: string, userId: string, targetLanguage: string) {
    const msg = await this.messageModel.findById(messageId).lean();
    if (!msg) throw new NotFoundException('Message not found');

    // Check cache
    const translations = (msg as any).translations;
    if (translations && translations instanceof Map
      ? translations.get(targetLanguage)
      : translations?.[targetLanguage]) {
      const cached = translations instanceof Map
        ? translations.get(targetLanguage)
        : translations[targetLanguage];
      return {
        messageId,
        targetLanguage,
        translatedText: cached,
        detectedLanguage: (msg as any).detectedLanguage,
        cached: true,
      };
    }

    const result = await this.translationService.translateText(
      (msg as any).content,
      targetLanguage,
    );

    await this.messageModel.updateOne(
      { _id: messageId },
      {
        $set: {
          [`translations.${targetLanguage}`]: result.translatedText,
          detectedLanguage: result.detectedSourceLanguage,
        },
      },
    );

    return {
      messageId,
      targetLanguage,
      translatedText: result.translatedText,
      detectedLanguage: result.detectedSourceLanguage,
      cached: false,
    };
  }

  async getMediaByConversation(conversationId: string, userId: string, limit = 50) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    const messages = await this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        isDeleted: false,
        type: { $in: ['image', 'video', 'audio', 'document'] },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return messages.map((m: any) => this.formatMessage(m, userId));
  }

  async starMessage(messageId: string, userId: string, starred: boolean) {
    const msg = await this.messageModel.findById(messageId).lean();
    if (!msg) throw new NotFoundException('Message not found');
    const conv = await this.conversationModel.findById((msg as any).conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    await this.messageModel.updateOne(
      { _id: new Types.ObjectId(messageId) },
      starred ? { $addToSet: { starredBy: userId } } : { $pull: { starredBy: userId } },
    );
    const updated = await this.messageModel.findById(messageId).populate('senderId', 'name profilePictureUrl').lean();
    return this.formatMessage(updated, userId);
  }

  async pinMessage(messageId: string, userId: string, pinned: boolean) {
    const msg = await this.messageModel.findById(messageId).lean();
    if (!msg) throw new NotFoundException('Message not found');
    const conv = await this.conversationModel.findById((msg as any).conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    const conversationId = (msg as any).conversationId?.toString?.() ?? (msg as any).conversationId?.toString?.();
    if (pinned) {
      // Enforce WhatsApp-like limit: max 3 pinned messages per conversation per user
      if (conversationId) {
        const existingPinned = await this.messageModel
          .find({
            conversationId: new Types.ObjectId(conversationId),
            pinnedBy: userId,
            isDeleted: false,
          })
          .sort({ createdAt: -1 })
          .select('_id')
          .lean();

        if (existingPinned.length >= 3) {
          // Keep 2 most recent pinned, unpin the rest
          const idsToUnpin = existingPinned.slice(2).map((m: any) => m._id);
          if (idsToUnpin.length) {
            await this.messageModel.updateMany({ _id: { $in: idsToUnpin } }, { $pull: { pinnedBy: userId } });
          }
        }
      }
      await this.messageModel.updateOne(
        { _id: new Types.ObjectId(messageId) },
        { $addToSet: { pinnedBy: userId } },
      );
    } else {
      await this.messageModel.updateOne(
        { _id: new Types.ObjectId(messageId) },
        { $pull: { pinnedBy: userId } },
      );
    }
    const updated = await this.messageModel.findById(messageId).populate('senderId', 'name profilePictureUrl').lean();
    return this.formatMessage(updated, userId);
  }

  async getStarredMessages(userId: string) {
    const convs = await this.conversationModel
      .find({ 'participants.userId': new Types.ObjectId(userId) })
      .select('_id')
      .lean();
    const convIds = convs.map((c: any) => c._id);
    const messages = await this.messageModel
      .find({ conversationId: { $in: convIds }, starredBy: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('senderId', 'name profilePictureUrl')
      .lean();
    return messages.map((m: any) => this.formatMessage(m, userId));
  }

  async getPinnedMessages(conversationId: string, userId: string) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    const messages = await this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId), pinnedBy: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('senderId', 'name profilePictureUrl')
      .lean();
    return messages.map((m: any) => this.formatMessage(m, userId));
  }

  // ── Link Preview: fetch OG metadata for URLs in text ──
  private async fetchLinkPreview(messageId: string, text: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = text.match(urlRegex);
    if (!match || !match[0]) return;
    const url = match[0];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsAppBot/1.0)' },
      });
      clearTimeout(timeout);
      const html = await res.text();
      const getTag = (prop: string) => {
        const m = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
        return m?.[1] || '';
      };
      const title = getTag('og:title') || getTag('twitter:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
      const description = getTag('og:description') || getTag('twitter:description') || getTag('description');
      const image = getTag('og:image') || getTag('twitter:image');
      if (title) {
        await this.messageModel.updateOne({ _id: messageId }, { $set: { linkPreview: { url, title, description, image } } });
      }
    } catch {}
  }

  // ── Poll Vote ──
  async votePoll(messageId: string, userId: string, optionIndex: number) {
    const msg = await this.messageModel.findById(messageId);
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.type !== 'poll' || !msg.poll) throw new ForbiddenException('Not a poll message');
    if (optionIndex < 0 || optionIndex >= msg.poll.options.length) {
      throw new ForbiddenException('Invalid option index');
    }
    const conv = await this.conversationModel.findById(msg.conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');

    // Remove user from all options first (single-vote), then add to selected
    const poll = msg.poll;
    if (!poll.allowMultiple) {
      for (const opt of poll.options) {
        opt.voters = opt.voters.filter((v: string) => v !== userId);
      }
    }
    // Toggle: if already voted, remove; otherwise add
    const idx = poll.options[optionIndex].voters.indexOf(userId);
    if (idx >= 0) {
      poll.options[optionIndex].voters.splice(idx, 1);
    } else {
      poll.options[optionIndex].voters.push(userId);
    }

    await this.messageModel.updateOne(
      { _id: msg._id },
      { $set: { poll } },
    );
    const updated = await this.messageModel.findById(messageId).populate('senderId', 'name profilePictureUrl').lean();
    const formatted = this.formatMessage(updated, userId);

    // Broadcast poll update to all participants
    const participantIds = conv.participants.map((p: any) => p.userId.toString());
    this.eventsGateway.emitPollVote(messageId, formatted.poll, msg.conversationId.toString(), participantIds).catch(() => {});

    return formatted;
  }

  // ── Message Edit (15-min window) ──
  async editMessage(messageId: string, userId: string, newContent: string) {
    const msg = await this.messageModel.findById(messageId);
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId.toString() !== userId) throw new ForbiddenException('Can only edit your own messages');
    if (msg.type !== 'text') throw new ForbiddenException('Can only edit text messages');
    const createdAt = (msg as any).createdAt ? new Date((msg as any).createdAt).getTime() : 0;
    if (Date.now() - createdAt > 15 * 60 * 1000) throw new ForbiddenException('Edit window expired (15 min)');
    await this.messageModel.updateOne(
      { _id: msg._id },
      { content: newContent, isEdited: true, editedAt: new Date() },
    );
    const updated = await this.messageModel.findById(messageId).populate('senderId', 'name profilePictureUrl').lean();
    const formatted = this.formatMessage(updated, userId);
    // Broadcast edit to all participants via dedicated event
    this.eventsGateway.emitMessageEdited(formatted).catch(() => {});
    return formatted;
  }

  // ── View Once: mark media as viewed ──
  async markViewOnce(messageId: string, userId: string) {
    const msg = await this.messageModel.findById(messageId);
    if (!msg) throw new NotFoundException('Message not found');
    if (!msg.isViewOnce) throw new ForbiddenException('Not a view-once message');
    await this.messageModel.updateOne(
      { _id: msg._id },
      { $addToSet: { viewedBy: userId } },
    );
    return { success: true };
  }

  // ── Disappearing Messages: set duration on conversation ──
  async setDisappearing(conversationId: string, userId: string, duration: number) {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    await this.conversationModel.updateOne({ _id: conv._id }, { disappearingDuration: duration });
    return { success: true, disappearingDuration: duration };
  }

  private formatMessage(msg: any, viewerUserId?: string) {
    const reactions = msg.reactions instanceof Map
      ? Object.fromEntries(msg.reactions)
      : (msg.reactions || {});
    const starredBy: string[] = Array.isArray(msg.starredBy) ? msg.starredBy : [];
    const pinnedBy: string[] = Array.isArray(msg.pinnedBy) ? msg.pinnedBy : [];
    // Handle populated replyToMessageId
    const replyTo = msg.replyToMessageId;
    const replyToMessage = replyTo?._id ? {
      id: replyTo._id.toString(),
      content: replyTo.content,
      type: replyTo.type,
      mediaUrl: replyTo.mediaUrl,
      senderName: replyTo.senderId?.name || replyTo.senderId?.toString(),
      isDeleted: !!replyTo.isDeleted,
    } : undefined;
    return {
      id: msg._id.toString(),
      conversationId: msg.conversationId?.toString(),
      senderId: msg.senderId?._id?.toString() || msg.senderId?.toString(),
      senderName: msg.senderId?.name,
      type: msg.type,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      replyToMessageId: replyTo?._id?.toString() || replyTo?.toString(),
      replyToMessage,
      status: msg.status,
      reactions,
      isDeleted: msg.isDeleted,
      isStarred: viewerUserId ? starredBy.includes(viewerUserId) : false,
      isPinned: viewerUserId ? pinnedBy.includes(viewerUserId) : false,
      createdAt: msg.createdAt,
      // New fields
      linkPreview: msg.linkPreview || null,
      isEdited: msg.isEdited ?? false,
      editedAt: msg.editedAt,
      expiresAt: msg.expiresAt,
      isViewOnce: msg.isViewOnce ?? false,
      viewedBy: msg.viewedBy || [],
      mentions: msg.mentions || [],
      sharedContact: msg.sharedContact || null,
      poll: msg.poll || null,
      location: msg.location || null,
    };
  }
}
