import { Body, Controller, Get, Param, Post, Delete, Patch, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('conversations/:conversationId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get()
  findAll(
    @CurrentUser() user: UserDocument,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.messagesService.findByConversation(
      conversationId,
      user._id.toString(),
      limit ? parseInt(limit, 10) : 50,
      before,
    );
  }

  @Post()
  create(
    @CurrentUser() user: UserDocument,
    @Param('conversationId') conversationId: string,
    @Body() dto: Omit<CreateMessageDto, 'conversationId'>,
  ) {
    return this.messagesService.create(user._id.toString(), {
      ...dto,
      conversationId,
    });
  }
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesControllerRoot {
  constructor(private messagesService: MessagesService) {}

  @Get('search')
  search(
    @CurrentUser() user: UserDocument,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.search(user._id.toString(), q || '', limit ? parseInt(limit, 10) : 50);
  }

  /**
   * GET /messages/unread-since?since=<ISO timestamp>
   * Returns all messages sent to this user since the given timestamp (missed message sync).
   * Used on app open after being offline.
   */
  @Get('unread-since')
  getUnreadSince(
    @CurrentUser() user: UserDocument,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getUnreadSince(
      user._id.toString(),
      since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      limit ? parseInt(limit, 10) : 200,
    );
  }

  @Post()
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateMessageDto) {
    return this.messagesService.create(user._id.toString(), dto);
  }

  @Post('read')
  markAsReadBatch(
    @CurrentUser() user: UserDocument,
    @Body() body: { messageIds: string[]; conversationId?: string },
  ) {
    return this.messagesService.markAsRead(
      body.messageIds || [],
      user._id.toString(),
      body.conversationId,
    );
  }

  @Post(':id/read')
  markAsRead(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { messageIds?: string[]; conversationId?: string },
  ) {
    const ids = body?.messageIds || [id];
    return this.messagesService.markAsRead(ids, user._id.toString(), body?.conversationId);
  }

  @Post(':id/reactions')
  addReaction(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() body: { emoji: string }) {
    return this.messagesService.addReaction(id, user._id.toString(), body.emoji || '👍');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body?: { deleteForEveryone?: boolean },
    @Query('deleteForEveryone') deleteForEveryoneQuery?: string,
  ) {
    const fromBody = body?.deleteForEveryone;
    const fromQuery = deleteForEveryoneQuery === 'true';
    return this.messagesService.delete(id, user._id.toString(), (fromBody ?? fromQuery) || false);
  }

  @Post(':id/translate')
  translateMessage(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { targetLanguage: string },
  ) {
    return this.messagesService.translateMessage(id, user._id.toString(), body.targetLanguage);
  }

  @Post(':id/forward')
  forward(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { conversationId: string },
  ) {
    return this.messagesService.forward(id, user._id.toString(), body.conversationId);
  }

  @Get('conversation/:conversationId/media')
  getMedia(
    @CurrentUser() user: UserDocument,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getMediaByConversation(
      conversationId,
      user._id.toString(),
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('starred')
  getStarredMessages(@CurrentUser() user: UserDocument) {
    return this.messagesService.getStarredMessages(user._id.toString());
  }

  @Get('conversation/:conversationId/pinned')
  getPinnedMessages(
    @CurrentUser() user: UserDocument,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagesService.getPinnedMessages(conversationId, user._id.toString());
  }

  @Patch(':id/star')
  starMessage(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { starred: boolean },
  ) {
    return this.messagesService.starMessage(id, user._id.toString(), body.starred ?? true);
  }

  @Patch(':id/pin')
  pinMessage(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { pinned: boolean },
  ) {
    return this.messagesService.pinMessage(id, user._id.toString(), body.pinned ?? true);
  }

  // ── Message Edit ──
  @Patch(':id')
  editMessage(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.messagesService.editMessage(id, user._id.toString(), body.content);
  }

  // ── Poll Vote ──
  @Post(':id/poll/vote')
  votePoll(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { optionIndex: number },
  ) {
    return this.messagesService.votePoll(id, user._id.toString(), body.optionIndex);
  }

  // ── View Once ──
  @Post(':id/view-once')
  markViewOnce(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.messagesService.markViewOnce(id, user._id.toString());
  }

  // ── Disappearing Messages ──
  @Patch('conversation/:conversationId/disappearing')
  setDisappearing(
    @CurrentUser() user: UserDocument,
    @Param('conversationId') conversationId: string,
    @Body() body: { duration: number },
  ) {
    return this.messagesService.setDisappearing(conversationId, user._id.toString(), body.duration);
  }
}
