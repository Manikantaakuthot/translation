import { Controller, Get, Param, Post, Body, Delete, UseGuards, Query } from '@nestjs/common';
import { StickersService } from './stickers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('stickers')
@UseGuards(JwtAuthGuard)
export class StickersController {
  constructor(private stickersService: StickersService) {}

  @Get('packs')
  getAllPacks(@Query('search') search?: string) {
    return this.stickersService.getAllPacks(search);
  }

  @Get('packs/default')
  getDefaultPacks() {
    return this.stickersService.getDefaultPacks();
  }

  @Get('packs/:id')
  getPack(@Param('id') id: string) {
    return this.stickersService.getPack(id);
  }

  @Post('packs')
  createPack(
    @CurrentUser() user: UserDocument,
    @Body() body: { name: string; publisher?: string; iconUrl?: string; stickers: { name: string; imageUrl: string; emoji?: string }[] },
  ) {
    return this.stickersService.createPack(body);
  }

  @Delete('packs/:id')
  deletePack(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.stickersService.deletePack(id);
  }
}
