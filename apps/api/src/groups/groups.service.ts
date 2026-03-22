import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from '../conversations/schemas/conversation.schema';
import { Group, GroupDocument } from '../conversations/schemas/group.schema';
import { EventsGateway } from '../events/events.gateway';
import { randomBytes } from 'crypto';

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    private eventsGateway: EventsGateway,
  ) {}

  async update(userId: string, groupId: string, updates: { name?: string; description?: string; iconUrl?: string }) {
    const conv = await this.conversationModel.findById(groupId);
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const isAdmin = conv.participants.some((p: any) => p.userId.toString() === userId && p.role === 'admin');
    if (!isAdmin) throw new ForbiddenException('Only admins can update group');
    const group = await this.groupModel.findOne({ conversationId: conv._id });
    if (!group) throw new NotFoundException('Group not found');
    if (updates.name) await this.groupModel.updateOne({ _id: group._id }, { $set: { name: updates.name } });
    if (updates.description !== undefined) await this.groupModel.updateOne({ _id: group._id }, { $set: { description: updates.description } });
    if (updates.iconUrl !== undefined) await this.groupModel.updateOne({ _id: group._id }, { $set: { iconUrl: updates.iconUrl } });
    this.eventsGateway.emitGroupUpdated(groupId, updates);
    return this.findOne(groupId, userId);
  }

  async addMember(userId: string, groupId: string, memberId: string) {
    const conv = await this.conversationModel.findById(groupId);
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const isAdmin = conv.participants.some((p: any) => p.userId.toString() === userId && p.role === 'admin');
    if (!isAdmin) throw new ForbiddenException('Only admins can add members');
    const exists = conv.participants.some((p: any) => p.userId.toString() === memberId);
    if (exists) throw new ForbiddenException('User already in group');
    await this.conversationModel.updateOne(
      { _id: conv._id },
      { $push: { participants: { userId: new Types.ObjectId(memberId), role: 'member' } } },
    );
    this.eventsGateway.emitGroupMemberAdded(groupId, memberId);
    return this.findOne(groupId, userId);
  }

  async removeMember(userId: string, groupId: string, memberId: string) {
    const conv = await this.conversationModel.findById(groupId);
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const isAdmin = conv.participants.some((p: any) => p.userId.toString() === userId && p.role === 'admin');
    const isSelf = userId === memberId;
    if (!isAdmin && !isSelf) throw new ForbiddenException('Only admins can remove other members');
    await this.conversationModel.updateOne(
      { _id: conv._id },
      { $pull: { participants: { userId: new Types.ObjectId(memberId) } } },
    );
    this.eventsGateway.emitGroupMemberRemoved(groupId, memberId);
    return this.findOne(groupId, userId);
  }

  async setAdmin(userId: string, groupId: string, memberId: string, isAdmin: boolean) {
    const conv = await this.conversationModel.findById(groupId);
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const requesterIsAdmin = conv.participants.some((p: any) => p.userId.toString() === userId && p.role === 'admin');
    if (!requesterIsAdmin) throw new ForbiddenException('Only admins can change roles');
    await this.conversationModel.updateOne(
      { _id: conv._id, 'participants.userId': new Types.ObjectId(memberId) },
      { $set: { 'participants.$.role': isAdmin ? 'admin' : 'member' } },
    );
    return this.findOne(groupId, userId);
  }

  async leaveGroup(userId: string, groupId: string) {
    return this.removeMember(userId, groupId, userId);
  }

  // ── Invite Links ──
  async generateInviteLink(userId: string, groupId: string) {
    const conv = await this.conversationModel.findById(groupId);
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const isAdmin = conv.participants.some((p: any) => p.userId.toString() === userId && p.role === 'admin');
    if (!isAdmin) throw new ForbiddenException('Only admins can generate invite links');

    const inviteCode = randomBytes(16).toString('hex');
    await this.groupModel.updateOne(
      { conversationId: conv._id },
      { $set: { inviteCode, inviteEnabled: true } },
    );

    return { inviteCode, inviteEnabled: true };
  }

  async revokeInviteLink(userId: string, groupId: string) {
    const conv = await this.conversationModel.findById(groupId);
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const isAdmin = conv.participants.some((p: any) => p.userId.toString() === userId && p.role === 'admin');
    if (!isAdmin) throw new ForbiddenException('Only admins can revoke invite links');

    await this.groupModel.updateOne(
      { conversationId: conv._id },
      { $set: { inviteCode: null, inviteEnabled: false } },
    );

    return { success: true };
  }

  async toggleInviteLink(userId: string, groupId: string, enabled: boolean) {
    const conv = await this.conversationModel.findById(groupId);
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const isAdmin = conv.participants.some((p: any) => p.userId.toString() === userId && p.role === 'admin');
    if (!isAdmin) throw new ForbiddenException('Only admins can toggle invite links');

    await this.groupModel.updateOne(
      { conversationId: conv._id },
      { $set: { inviteEnabled: enabled } },
    );

    return { inviteEnabled: enabled };
  }

  async getGroupByInviteCode(inviteCode: string) {
    const group = await this.groupModel.findOne({ inviteCode, inviteEnabled: true }).lean();
    if (!group) throw new NotFoundException('Invite link is invalid or expired');

    const conv = await this.conversationModel.findById(group.conversationId);
    if (!conv) throw new NotFoundException('Group not found');

    return {
      id: conv._id.toString(),
      name: group.name,
      description: group.description,
      iconUrl: group.iconUrl,
      memberCount: conv.participants.length,
    };
  }

  async joinByInviteCode(userId: string, inviteCode: string) {
    const group = await this.groupModel.findOne({ inviteCode, inviteEnabled: true }).lean();
    if (!group) throw new NotFoundException('Invite link is invalid or expired');

    const conv = await this.conversationModel.findById(group.conversationId);
    if (!conv) throw new NotFoundException('Group not found');

    const exists = conv.participants.some((p: any) => p.userId.toString() === userId);
    if (exists) return this.findOne(conv._id.toString(), userId);

    await this.conversationModel.updateOne(
      { _id: conv._id },
      { $push: { participants: { userId: new Types.ObjectId(userId), role: 'member' } } },
    );

    this.eventsGateway.emitGroupMemberAdded(conv._id.toString(), userId);
    return this.findOne(conv._id.toString(), userId);
  }

  async findOne(groupId: string, userId: string) {
    const conv = await this.conversationModel
      .findById(groupId)
      .populate('participants.userId', 'name phone profilePictureUrl statusText isOnline lastSeen');
    if (!conv) throw new NotFoundException('Group not found');
    if (conv.type !== 'group') throw new NotFoundException('Not a group');
    const isParticipant = conv.participants.some((p: any) => p.userId._id.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    const group = await this.groupModel.findOne({ conversationId: conv._id }).lean();
    const participants = (conv.participants || []).map((p: any) => {
      const u = p.userId;
      return {
        userId: u?._id?.toString(),
        name: u?.name,
        profilePictureUrl: u?.profilePictureUrl,
        role: p.role,
      };
    });
    return {
      id: conv._id.toString(),
      name: group?.name,
      description: group?.description,
      iconUrl: group?.iconUrl,
      inviteCode: group?.inviteCode,
      inviteEnabled: group?.inviteEnabled ?? false,
      participants,
    };
  }
}
