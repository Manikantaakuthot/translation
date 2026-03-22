import { Body, Controller, Get, Param, Post, Put, Delete, UseGuards, Query } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Post()
  create(
    @CurrentUser() user: UserDocument,
    @Body() body: { name: string; description?: string; iconUrl?: string },
  ) {
    return this.channelsService.create(user._id.toString(), body);
  }

  @Get()
  findAll(@CurrentUser() user: UserDocument) {
    return this.channelsService.findAllForUser(user._id.toString());
  }

  @Get('discover')
  discover(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.channelsService.discover(q, limit ? parseInt(limit, 10) : 20);
  }

  @Get(':id')
  findOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.channelsService.findOne(id, user._id.toString());
  }

  @Put(':id')
  update(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; iconUrl?: string },
  ) {
    return this.channelsService.update(user._id.toString(), id, body);
  }

  @Post(':id/subscribe')
  subscribe(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.channelsService.subscribe(user._id.toString(), id);
  }

  @Delete(':id/subscribe')
  unsubscribe(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.channelsService.unsubscribe(user._id.toString(), id);
  }

  @Post(':id/messages')
  postMessage(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() body: { content: string; type?: string; mediaUrl?: string },
  ) {
    return this.channelsService.postMessage(user._id.toString(), id, body);
  }

  @Get(':id/messages')
  getMessages(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.channelsService.getMessages(id, limit ? parseInt(limit, 10) : 50, before);
  }

  @Delete(':id')
  deleteChannel(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.channelsService.deleteChannel(user._id.toString(), id);
  }
}
