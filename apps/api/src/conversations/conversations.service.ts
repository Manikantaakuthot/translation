import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Group, GroupDocument } from './schemas/group.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { Message } from '../messages/schemas/message.schema';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(Message.name) private messageModel: Model<any>,
    @Inject(forwardRef(() => EventsGateway)) private eventsGateway: EventsGateway,
  ) {}

  async create(userId: string, dto: CreateConversationDto) {
    const participantIds = [userId, ...dto.participantIds].filter((id, i, arr) => arr.indexOf(id) === i);
    if (dto.type === 'direct') {
      if (participantIds.length !== 2) {
        throw new ForbiddenException('Direct conversation must have exactly 2 participants');
      }
      const existing = await this.conversationModel.findOne({
        type: 'direct',
        'participants.userId': { $all: participantIds.map((id) => new Types.ObjectId(id)) },
      });
      if (existing) {
        return this.formatConversation(existing);
      }
    }
    const participants = participantIds.map((id) => ({
      userId: new Types.ObjectId(id),
      role: id === userId ? 'admin' : 'member',
    }));
    const conv = await this.conversationModel.create({
      type: dto.type,
      createdBy: new Types.ObjectId(userId),
      participants,
    });
    if (dto.type === 'group' && dto.name) {
      await this.groupModel.create({
        conversationId: conv._id,
        name: dto.name,
        description: dto.description,
      });
    }
    // Notify all participants about the new conversation via socket
    this.eventsGateway.emitConversationCreated(conv._id.toString(), participantIds).catch((err) =>
      console.error('[Conv] Error emitting conversation:new:', err),
    );
    return this.formatConversation(conv, undefined, userId);
  }

  async findAllForUser(userId: string) {
    const convs = await this.conversationModel
      .find({ 'participants.userId': new Types.ObjectId(userId) })
      .populate('participants.userId', 'name profilePictureUrl isOnline lastSeen')
      .sort({ updatedAt: -1 })
      .lean();

    // Run all per-conversation queries IN PARALLEL — not sequentially —
    // so N conversations take ~1 round-trip instead of N×3 round-trips.
    const result = await Promise.all(
      convs.map(async (c) => {
        const [group, lastMsg, unreadCount] = await Promise.all([
          c.type === 'group'
            ? this.groupModel.findOne({ conversationId: c._id }).lean()
            : Promise.resolve(null),
          this.messageModel
            .findOne({ conversationId: c._id })
            .sort({ createdAt: -1 })
            .select('content type mediaUrl senderId createdAt isDeleted')
            .populate('senderId', 'name')
            .lean(),
          this.messageModel.countDocuments({
            conversationId: c._id,
            isDeleted: false,
            senderId: { $ne: new Types.ObjectId(userId) },
            'status.read': { $not: { $elemMatch: { userId: new Types.ObjectId(userId) } } },
          }),
        ]);
        return this.formatConversation(c, group, userId, lastMsg, unreadCount);
      }),
    );
    return result;
  }

  async findOne(id: string, userId: string) {
    const conv = await this.conversationModel
      .findById(id)
      .populate('participants.userId', 'name phone profilePictureUrl statusText isOnline lastSeen');
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId._id.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    const group = conv.type === 'group' ? await this.groupModel.findOne({ conversationId: conv._id }).lean() : null;
    return this.formatConversation(conv, group, userId);
  }

  private formatConversation(conv: any, group?: any, currentUserId?: string, lastMsg?: any, unreadCount?: number) {
    const participants = (conv.participants || []).map((p: any) => {
      const u = p.userId;
      const pid = u?._id?.toString() || u?.toString();
      return {
        userId: pid,
        name: u?.name,
        profilePictureUrl: u?.profilePictureUrl,
        statusText: u?.statusText,
        isOnline: u?.isOnline,
        lastSeen: u?.lastSeen,
        role: p.role,
        isMuted: p.isMuted,
        isArchived: p.isArchived,
      };
    });
    const myParticipant = currentUserId ? participants.find((p: any) => p.userId === currentUserId) : null;
    const lastMessage = lastMsg ? {
      id: lastMsg._id?.toString(),
      content: lastMsg.isDeleted ? '🚫 This message was deleted' : lastMsg.content,
      type: lastMsg.type,
      mediaUrl: lastMsg.mediaUrl,
      senderName: lastMsg.senderId?.name,
      createdAt: lastMsg.createdAt,
      isDeleted: !!lastMsg.isDeleted,
    } : undefined;
    return {
      id: conv._id.toString(),
      type: conv.type,
      createdBy: conv.createdBy?.toString(),
      participants,
      name: group?.name,
      description: group?.description,
      iconUrl: group?.iconUrl,
      updatedAt: conv.updatedAt,
      isMuted: myParticipant?.isMuted,
      isArchived: myParticipant?.isArchived,
      lastMessage,
      unreadCount: unreadCount ?? 0,
    };
  }

  async mute(id: string, userId: string, muted: boolean) {
    const conv = await this.conversationModel.findById(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    await this.conversationModel.updateOne(
      { _id: id, 'participants.userId': new Types.ObjectId(userId) },
      { $set: { 'participants.$.isMuted': muted } },
    );
    return this.findOne(id, userId);
  }

  async archive(id: string, userId: string, archived: boolean) {
    const conv = await this.conversationModel.findById(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    await this.conversationModel.updateOne(
      { _id: id, 'participants.userId': new Types.ObjectId(userId) },
      { $set: { 'participants.$.isArchived': archived } },
    );
    return this.findOne(id, userId);
  }

  async getOrCreateDirectConversation(userId: string, otherUserId: string) {
    const participantIds = [userId, otherUserId].sort();
    let conv = await this.conversationModel.findOne({
      type: 'direct',
      'participants.userId': { $all: participantIds.map((id) => new Types.ObjectId(id)) },
    });
    if (!conv) {
      conv = await this.conversationModel.create({
        type: 'direct',
        createdBy: new Types.ObjectId(userId),
        participants: participantIds.map((id) => ({
          userId: new Types.ObjectId(id),
          role: 'member',
        })),
      });
      // Notify all participants about the new conversation via socket
      this.eventsGateway.emitConversationCreated(conv._id.toString(), participantIds).catch((err) =>
        console.error('[Conv] Error emitting conversation:new:', err),
      );
    }
    return this.formatConversation(conv, undefined, userId);
  }
}
