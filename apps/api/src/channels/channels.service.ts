import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelDocument } from './schemas/channel.schema';
import { Message, MessageDocument } from '../messages/schemas/message.schema';
import { Conversation, ConversationDocument } from '../conversations/schemas/conversation.schema';
import { EventsGateway } from '../events/events.gateway';
import { randomBytes } from 'crypto';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel(Channel.name) private channelModel: Model<ChannelDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private eventsGateway: EventsGateway,
  ) {}

  async create(userId: string, data: { name: string; description?: string; iconUrl?: string }) {
    // Create a linked conversation of type 'broadcast' for message storage
    const conv = await this.conversationModel.create({
      type: 'broadcast',
      createdBy: new Types.ObjectId(userId),
      participants: [{ userId: new Types.ObjectId(userId), role: 'admin' }],
    });

    const channel = await this.channelModel.create({
      name: data.name,
      description: data.description,
      iconUrl: data.iconUrl,
      createdBy: new Types.ObjectId(userId),
      admins: [new Types.ObjectId(userId)],
      subscribers: [{ userId: new Types.ObjectId(userId) }],
      inviteCode: randomBytes(12).toString('hex'),
      subscriberCount: 1,
    });

    return this.formatChannel(channel, conv._id.toString());
  }

  async findAllForUser(userId: string) {
    const channels = await this.channelModel
      .find({ 'subscribers.userId': new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();
    return channels.map((c: any) => this.formatChannel(c));
  }

  async discover(query?: string, limit = 20) {
    const filter: any = {};
    if (query) {
      filter.name = { $regex: query, $options: 'i' };
    }
    const channels = await this.channelModel
      .find(filter)
      .sort({ subscriberCount: -1 })
      .limit(limit)
      .lean();
    return channels.map((c: any) => this.formatChannel(c));
  }

  async findOne(id: string, userId: string) {
    const channel = await this.channelModel.findById(id).lean();
    if (!channel) throw new NotFoundException('Channel not found');
    const isSubscribed = (channel as any).subscribers?.some(
      (s: any) => s.userId.toString() === userId,
    );
    return {
      ...this.formatChannel(channel),
      isSubscribed,
    };
  }

  async update(userId: string, channelId: string, updates: { name?: string; description?: string; iconUrl?: string }) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');
    const isAdmin = channel.admins.some((a: any) => a.toString() === userId);
    if (!isAdmin) throw new ForbiddenException('Only admins can update channel');

    if (updates.name) channel.name = updates.name;
    if (updates.description !== undefined) channel.description = updates.description;
    if (updates.iconUrl !== undefined) channel.iconUrl = updates.iconUrl;
    await channel.save();

    return this.formatChannel(channel);
  }

  async subscribe(userId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');
    const exists = channel.subscribers.some((s: any) => s.userId.toString() === userId);
    if (exists) return this.findOne(channelId, userId);

    await this.channelModel.updateOne(
      { _id: channel._id },
      {
        $push: { subscribers: { userId: new Types.ObjectId(userId) } },
        $inc: { subscriberCount: 1 },
      },
    );
    return this.findOne(channelId, userId);
  }

  async unsubscribe(userId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    await this.channelModel.updateOne(
      { _id: channel._id },
      {
        $pull: { subscribers: { userId: new Types.ObjectId(userId) } },
        $inc: { subscriberCount: -1 },
      },
    );
    return { success: true };
  }

  async postMessage(userId: string, channelId: string, data: { content: string; type?: string; mediaUrl?: string }) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');
    const isAdmin = channel.admins.some((a: any) => a.toString() === userId);
    if (!isAdmin) throw new ForbiddenException('Only admins can post in channels');

    // Find or create a conversation linked to this channel
    let conv = await this.conversationModel.findOne({
      type: 'broadcast',
      createdBy: channel.createdBy,
      name: channel.name,
    });
    if (!conv) {
      conv = await this.conversationModel.create({
        type: 'broadcast',
        createdBy: channel.createdBy,
        participants: [{ userId: channel.createdBy, role: 'admin' }],
        name: channel.name,
      });
    }

    const msg = await this.messageModel.create({
      conversationId: conv._id,
      senderId: new Types.ObjectId(userId),
      type: data.type || 'text',
      content: data.content,
      mediaUrl: data.mediaUrl,
      status: { sent: new Date() },
    });

    // Emit to all subscribers
    const subscriberIds = channel.subscribers.map((s: any) => s.userId.toString());
    for (const subId of subscriberIds) {
      if (subId !== userId) {
        this.eventsGateway.emitToUser?.(subId, 'channel:message', {
          channelId,
          channelName: channel.name,
          message: {
            id: msg._id.toString(),
            content: msg.content,
            type: msg.type,
            mediaUrl: msg.mediaUrl,
            createdAt: (msg as any).createdAt,
          },
        });
      }
    }

    return {
      id: msg._id.toString(),
      content: msg.content,
      type: msg.type,
      mediaUrl: msg.mediaUrl,
      createdAt: (msg as any).createdAt,
    };
  }

  async getMessages(channelId: string, limit = 50, before?: string) {
    const channel = await this.channelModel.findById(channelId).lean();
    if (!channel) throw new NotFoundException('Channel not found');

    // Find the broadcast conversation linked to this channel
    const conv = await this.conversationModel.findOne({
      type: 'broadcast',
      createdBy: (channel as any).createdBy,
    });
    if (!conv) return [];

    const query: any = { conversationId: conv._id, isDeleted: false };
    if (before) {
      const beforeMsg = await this.messageModel.findById(before).lean();
      if (beforeMsg && (beforeMsg as any).createdAt) {
        query.createdAt = { $lt: (beforeMsg as any).createdAt };
      }
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'name profilePictureUrl')
      .lean();

    return messages.reverse().map((m: any) => ({
      id: m._id.toString(),
      senderId: m.senderId?._id?.toString() || m.senderId?.toString(),
      senderName: m.senderId?.name,
      content: m.content,
      type: m.type,
      mediaUrl: m.mediaUrl,
      createdAt: m.createdAt,
    }));
  }

  async deleteChannel(userId: string, channelId: string) {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the creator can delete a channel');
    }
    await this.channelModel.deleteOne({ _id: channel._id });
    return { success: true };
  }

  private formatChannel(c: any, conversationId?: string) {
    return {
      id: c._id.toString(),
      name: c.name,
      description: c.description,
      iconUrl: c.iconUrl,
      createdBy: c.createdBy?.toString(),
      subscriberCount: c.subscriberCount ?? c.subscribers?.length ?? 0,
      inviteCode: c.inviteCode,
      inviteEnabled: c.inviteEnabled ?? true,
      conversationId,
    };
  }
}
