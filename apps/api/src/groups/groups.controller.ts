import { Body, Controller, Get, Param, Post, Put, Delete, UseGuards } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { UpdateGroupDto } from './dto/update-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Get(':id')
  findOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.groupsService.findOne(id, user._id.toString());
  }

  @Put(':id')
  update(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(user._id.toString(), id, dto);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.groupsService.addMember(user._id.toString(), id, body.userId);
  }

  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: UserDocument, @Param('id') id: string, @Param('userId') memberId: string) {
    return this.groupsService.removeMember(user._id.toString(), id, memberId);
  }

  @Put(':id/admins')
  setAdmin(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() body: { userId: string; isAdmin: boolean }) {
    return this.groupsService.setAdmin(user._id.toString(), id, body.userId, body.isAdmin ?? true);
  }

  @Delete(':id/leave')
  leaveGroup(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.groupsService.leaveGroup(user._id.toString(), id);
  }

  // ── Invite Links ──
  @Post(':id/invite')
  generateInviteLink(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.groupsService.generateInviteLink(user._id.toString(), id);
  }

  @Delete(':id/invite')
  revokeInviteLink(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.groupsService.revokeInviteLink(user._id.toString(), id);
  }

  @Post(':id/invite/toggle')
  toggleInviteLink(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.groupsService.toggleInviteLink(user._id.toString(), id, body.enabled ?? true);
  }

  // ── Join by invite code (authenticated) ──
  @Post('join/:inviteCode')
  joinByInviteCode(@CurrentUser() user: UserDocument, @Param('inviteCode') inviteCode: string) {
    return this.groupsService.joinByInviteCode(user._id.toString(), inviteCode);
  }
}

// Public route — no auth guard needed to view group info
@Controller('groups/invite')
export class GroupsInviteController {
  constructor(private groupsService: GroupsService) {}

  @Get(':inviteCode')
  getGroupByInviteCode(@Param('inviteCode') inviteCode: string) {
    return this.groupsService.getGroupByInviteCode(inviteCode);
  }
}
