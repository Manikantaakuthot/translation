import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Status, StatusDocument } from './schemas/status.schema';
import { Contact, ContactDocument } from '../users/schemas/contact.schema';
import { Conversation, ConversationDocument } from '../conversations/schemas/conversation.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class StatusService {
  constructor(
    @InjectModel(Status.name) private statusModel: Model<StatusDocument>,
    @InjectModel(Contact.name) private contactModel: Model<ContactDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private eventsGateway: EventsGateway,
  ) {}

  async create(
    userId: string,
    data: { type: 'text' | 'image' | 'video'; content?: string; mediaUrl?: string; backgroundColor?: string },
  ) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    const status = await this.statusModel.create({
      userId: new Types.ObjectId(userId),
      type: data.type,
      content: data.content,
      mediaUrl: data.mediaUrl,
      backgroundColor: data.backgroundColor || '',
      expiresAt,
    });

    const result = {
      id: status._id.toString(),
      type: status.type,
      content: status.content,
      mediaUrl: status.mediaUrl,
      backgroundColor: status.backgroundColor,
      expiresAt: status.expiresAt,
      createdAt: (status as any).createdAt,
    };

    // Notify all connected users about the new status
    try {
      const user = await this.userModel.findById(userId, 'name profilePictureUrl').lean();
      this.eventsGateway.server.emit('status:created', {
        userId,
        userName: (user as any)?.name,
        profilePictureUrl: (user as any)?.profilePictureUrl,
        status: result,
      });
    } catch (err) {
      console.error('[Status] Failed to emit status:created:', err);
    }

    return result;
  }

  async getFeed(userId: string) {
    // 1. Get contact user IDs (existing behavior)
    const contacts = await this.contactModel
      .find({ userId: new Types.ObjectId(userId), isBlocked: false })
      .lean();
    const contactIds = contacts.map((c: any) => c.contactUserId.toString());

    // 2. Get conversation participant IDs (NEW — so users who chat can see each other's statuses)
    const conversations = await this.conversationModel
      .find({
        'participants.userId': new Types.ObjectId(userId),
        type: { $in: ['direct', 'group'] },
      })
      .lean();
    const participantIds = new Set<string>();
    for (const conv of conversations) {
      for (const p of (conv as any).participants || []) {
        const pid = p.userId?.toString();
        if (pid) participantIds.add(pid);
      }
    }

    // 3. Merge: self + contacts + conversation participants (deduplicated)
    const allUserIds = [...new Set([userId, ...contactIds, ...participantIds])];

    const statuses = await this.statusModel
      .find({
        userId: { $in: allUserIds.map((id) => new Types.ObjectId(id)) },
        expiresAt: { $gt: new Date() },
      })
      .populate('userId', 'name profilePictureUrl')
      .sort({ createdAt: -1 })
      .lean();

    const byUser = new Map<string, any[]>();
    for (const s of statuses) {
      const uid = (s as any).userId._id.toString();
      if (!byUser.has(uid)) byUser.set(uid, []);

      // Determine if the current user has viewed this status
      const viewerIds = ((s as any).viewers || []).map((v: any) =>
        v.userId.toString(),
      );
      const viewedByMe = viewerIds.includes(userId);

      byUser.get(uid)!.push({
        id: (s as any)._id.toString(),
        type: (s as any).type,
        content: (s as any).content,
        mediaUrl: (s as any).mediaUrl,
        backgroundColor: (s as any).backgroundColor || '',
        expiresAt: (s as any).expiresAt,
        createdAt: (s as any).createdAt,
        viewedByMe,
        viewerCount: viewerIds.length,
        // Return viewer details only for own statuses (with names resolved)
        viewers:
          uid === userId
            ? await this.resolveViewerNames((s as any).viewers || [])
            : undefined,
      });
    }

    return Array.from(byUser.entries()).map(([uid, items]) => {
      const sample = statuses.find(
        (s: any) => s.userId._id.toString() === uid,
      ) as any;
      // A user's entry is "viewed" only if ALL their statuses have been viewed
      const allViewed = items.every((s) => s.viewedByMe);
      return {
        userId: uid,
        userName: sample?.userId?.name,
        profilePictureUrl: sample?.userId?.profilePictureUrl,
        allViewed,
        statuses: items.reverse(), // oldest first — WhatsApp-like chronological viewer
      };
    });
  }

  /** Resolve viewer userIds to actual names */
  private async resolveViewerNames(viewers: any[]) {
    if (!viewers.length) return [];
    const userIds = viewers.map((v: any) => v.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } }, 'name profilePictureUrl')
      .lean();
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

    return viewers.map((v: any) => {
      const u = userMap.get(v.userId.toString());
      return {
        userId: v.userId.toString(),
        userName: (u as any)?.name || 'Unknown',
        profilePictureUrl: (u as any)?.profilePictureUrl,
        viewedAt: v.viewedAt,
      };
    });
  }

  async markViewed(statusId: string, viewerId: string) {
    await this.statusModel.updateOne(
      {
        _id: new Types.ObjectId(statusId),
        'viewers.userId': { $ne: new Types.ObjectId(viewerId) },
      },
      {
        $push: {
          viewers: {
            userId: new Types.ObjectId(viewerId),
            viewedAt: new Date(),
          },
        },
      },
    );
    return { success: true };
  }

  async delete(statusId: string, userId: string) {
    const status = await this.statusModel.findById(statusId);
    if (!status) throw new NotFoundException('Status not found');
    if (status.userId.toString() !== userId)
      throw new ForbiddenException('Can only delete own status');
    await this.statusModel.deleteOne({ _id: status._id });

    // Notify all connected users
    try {
      this.eventsGateway.server.emit('status:deleted', { userId, statusId });
    } catch (err) {
      console.error('[Status] Failed to emit status:deleted:', err);
    }

    return { success: true };
  }
}
