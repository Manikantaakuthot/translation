import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private pushService: PushService) {}

  @Post('subscribe')
  subscribe(
    @CurrentUser() user: UserDocument,
    @Body() body: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; fcmToken?: string; platform?: string },
  ) {
    return this.pushService.subscribe(user._id.toString(), body);
  }
}
