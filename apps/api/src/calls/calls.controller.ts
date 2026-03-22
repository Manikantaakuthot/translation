import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private callsService: CallsService) {}

  @Post('initiate')
  initiate(
    @CurrentUser() user: UserDocument,
    @Body() body: { calleeId: string; type: 'voice' | 'video' },
  ) {
    return this.callsService.initiate(user._id.toString(), body.calleeId, body.type || 'voice');
  }

  @Post(':id/answer')
  answer(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.callsService.answer(id, user._id.toString());
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.callsService.reject(id, user._id.toString());
  }

  @Post(':id/end')
  end(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.callsService.end(id, user._id.toString());
  }

  @Get('history')
  getHistory(@CurrentUser() user: UserDocument, @Query('limit') limit?: string) {
    return this.callsService.getHistory(user._id.toString(), limit ? parseInt(limit, 10) : 50);
  }
}
