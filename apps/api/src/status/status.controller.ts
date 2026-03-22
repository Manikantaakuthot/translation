import { Body, Controller, Get, Param, Post, Delete, UseGuards } from '@nestjs/common';
import { StatusService } from './status.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('status')
@UseGuards(JwtAuthGuard)
export class StatusController {
  constructor(private statusService: StatusService) {}

  @Post()
  create(
    @CurrentUser() user: UserDocument,
    @Body() body: { type: 'text' | 'image' | 'video'; content?: string; mediaUrl?: string; backgroundColor?: string },
  ) {
    return this.statusService.create(user._id.toString(), body);
  }

  @Get('feed')
  getFeed(@CurrentUser() user: UserDocument) {
    return this.statusService.getFeed(user._id.toString());
  }

  @Post(':id/view')
  markViewed(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.statusService.markViewed(id, user._id.toString());
  }

  @Delete(':id')
  delete(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.statusService.delete(id, user._id.toString());
  }
}
