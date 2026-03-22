import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Call, CallDocument } from './schemas/call.schema';
import { EventsGateway } from '../events/events.gateway';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class CallsService {
  constructor(
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private eventsGateway: EventsGateway,
  ) {}

  async initiate(callerId: string, calleeId: string, type: 'voice' | 'video') {
    if (callerId === calleeId) throw new ForbiddenException('Cannot call yourself');
    const caller = await this.userModel.findById(callerId).select('name').lean();
    const callee = await this.userModel.findById(calleeId).select('name').lean();
    console.log(`[Calls] Initiating ${type} call from ${callerId} (${(caller as any)?.name}) to ${calleeId} (${(callee as any)?.name})`);
    const call = await this.callModel.create({
      callerId: new Types.ObjectId(callerId),
      calleeId: new Types.ObjectId(calleeId),
      type,
      status: 'ringing',
    });
    this.eventsGateway.emitCallInitiate(
      call._id.toString(),
      callerId,
      (caller as any)?.name || 'Unknown',
      calleeId,
      type,
    );
    return {
      id: call._id.toString(),
      callerId,
      calleeId,
      type,
      status: 'ringing',
      createdAt: (call as any).createdAt,
    };
  }

  async answer(callId: string, userId: string) {
    const call = await this.callModel.findById(callId);
    if (!call) throw new NotFoundException('Call not found');
    if (call.calleeId.toString() !== userId) throw new ForbiddenException('Not the callee');
    if (call.status !== 'ringing') throw new ForbiddenException('Call no longer ringing');
    await this.callModel.updateOne(
      { _id: call._id },
      { status: 'answered', startedAt: new Date() },
    );
    const callee = await this.userModel.findById(call.calleeId).select('name').lean();
    this.eventsGateway.emitCallAnswered(callId, call.callerId.toString(), (callee as any)?.name || 'Unknown');
    return this.findOne(callId, userId);
  }

  async reject(callId: string, userId: string) {
    const call = await this.callModel.findById(callId);
    if (!call) throw new NotFoundException('Call not found');
    if (call.calleeId.toString() !== userId) throw new ForbiddenException('Not the callee');
    await this.callModel.updateOne({ _id: call._id }, { status: 'rejected' });
    this.eventsGateway.emitCallRejected(callId, call.callerId.toString());
    return this.findOne(callId, userId);
  }

  async end(callId: string, userId: string) {
    const call = await this.callModel.findById(callId);
    if (!call) throw new NotFoundException('Call not found');
    const isParticipant = call.callerId.toString() === userId || call.calleeId.toString() === userId;
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    const endedAt = new Date();
    const duration = call.startedAt ? Math.floor((endedAt.getTime() - call.startedAt.getTime()) / 1000) : 0;
    await this.callModel.updateOne(
      { _id: call._id },
      { status: 'ended', endedAt, duration },
    );
    const otherId = call.callerId.toString() === userId ? call.calleeId.toString() : call.callerId.toString();
    this.eventsGateway.emitCallEnded(callId, otherId);
    return this.findOne(callId, userId);
  }

  async findOne(callId: string, userId: string) {
    const call = await this.callModel
      .findById(callId)
      .populate('callerId', 'name profilePictureUrl')
      .populate('calleeId', 'name profilePictureUrl')
      .lean();
    if (!call) throw new NotFoundException('Call not found');
    const isParticipant = (call as any).callerId._id.toString() === userId || (call as any).calleeId._id.toString() === userId;
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    return this.formatCall(call);
  }

  async getHistory(userId: string, limit = 50) {
    const calls = await this.callModel
      .find({
        $or: [
          { callerId: new Types.ObjectId(userId) },
          { calleeId: new Types.ObjectId(userId) },
        ],
      })
      .populate('callerId', 'name profilePictureUrl')
      .populate('calleeId', 'name profilePictureUrl')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return calls.map((c) => this.formatCall(c));
  }

  private formatCall(call: any) {
    const caller = call.callerId;
    const callee = call.calleeId;
    return {
      id: call._id.toString(),
      callerId: caller?._id?.toString(),
      callerName: caller?.name,
      calleeId: callee?._id?.toString(),
      calleeName: callee?.name,
      type: call.type,
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      duration: call.duration,
      createdAt: call.createdAt,
    };
  }
}
