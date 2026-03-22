import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}

  @Get()
  findAll(@CurrentUser() user: UserDocument) {
    return this.conversationsService.findAllForUser(user._id.toString());
  }

  @Get(':id')
  findOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.conversationsService.findOne(id, user._id.toString());
  }

  @Post()
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(user._id.toString(), dto);
  }

  @Post('direct/:userId')
  getOrCreateDirect(@CurrentUser() user: UserDocument, @Param('userId') otherUserId: string) {
    return this.conversationsService.getOrCreateDirectConversation(user._id.toString(), otherUserId);
  }

  @Put(':id/mute')
  mute(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() body: { muted?: boolean }) {
    return this.conversationsService.mute(id, user._id.toString(), body.muted ?? true);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() body: { archived?: boolean }) {
    return this.conversationsService.archive(id, user._id.toString(), body.archived ?? true);
  }
}
