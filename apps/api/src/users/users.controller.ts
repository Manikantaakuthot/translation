import { Body, Controller, Get, Param, Post, Delete, Put, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from './schemas/user.schema';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: UserDocument) {
    return this.usersService.getMe(user);
  }

  @Put('me')
  updateMe(@CurrentUser() user: UserDocument, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user._id.toString(), dto);
  }

  @Put('me/privacy')
  updatePrivacy(@CurrentUser() user: UserDocument, @Body() body: any) {
    return this.usersService.updatePrivacy(user._id.toString(), body);
  }

  @Put('me/notifications')
  updateNotifications(@CurrentUser() user: UserDocument, @Body() body: any) {
    return this.usersService.updateNotifications(user._id.toString(), body);
  }

  @Put('me/language')
  updateLanguage(
    @CurrentUser() user: UserDocument,
    @Body() dto: { preferredLanguage: string; autoTranslateMessages: boolean; autoTranslateCalls: boolean },
  ) {
    return this.usersService.updateLanguagePreference(
      user._id.toString(),
      dto.preferredLanguage,
      dto.autoTranslateMessages,
      dto.autoTranslateCalls,
    );
  }

  @Get('search')
  searchUsers(@CurrentUser() user: UserDocument, @Query('q') q: string) {
    return this.usersService.searchUsers(q || '', user._id.toString());
  }

  @Get('contacts')
  getContacts(@CurrentUser() user: UserDocument) {
    return this.usersService.getContacts(user._id.toString());
  }

  @Post('contacts/sync')
  syncContacts(@CurrentUser() user: UserDocument, @Body() body: { phones: string[] }) {
    return this.usersService.syncPhoneContacts(user._id.toString(), body.phones || []);
  }

  @Post('contacts/:id')
  addContact(@CurrentUser() user: UserDocument, @Param('id') contactUserId: string, @Body() body: { displayName?: string }) {
    return this.usersService.addContact(user._id.toString(), contactUserId, body?.displayName);
  }

  @Delete('contacts/:id')
  removeContact(@CurrentUser() user: UserDocument, @Param('id') contactUserId: string) {
    return this.usersService.removeContact(user._id.toString(), contactUserId);
  }

  @Get('me/export')
  exportMyData(@CurrentUser() user: UserDocument) {
    return this.usersService.exportUserData(user._id.toString());
  }

  @Delete('me')
  deleteMyAccount(@CurrentUser() user: UserDocument) {
    return this.usersService.deleteAccount(user._id.toString());
  }

  @Post('create-by-phone')
  createByPhone(
    @CurrentUser() user: UserDocument,
    @Body() body: { phone: string; name: string; countryCode?: string },
  ) {
    return this.usersService.findOrCreateByPhone(
      user._id.toString(),
      body.phone,
      body.name,
      body.countryCode || '+91',
    );
  }

  @Post('contacts/:id/block')
  blockContact(@CurrentUser() user: UserDocument, @Param('id') contactUserId: string) {
    return this.usersService.blockContact(user._id.toString(), contactUserId);
  }

  @Post('contacts/:id/unblock')
  unblockContact(@CurrentUser() user: UserDocument, @Param('id') contactUserId: string) {
    return this.usersService.unblockContact(user._id.toString(), contactUserId);
  }

  @Get(':id/common-groups')
  getCommonGroups(@CurrentUser() user: UserDocument, @Param('id') otherUserId: string) {
    return this.usersService.getCommonGroups(user._id.toString(), otherUserId);
  }

  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }
}
