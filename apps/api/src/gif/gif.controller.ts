import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GifService } from './gif.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('gif')
@UseGuards(JwtAuthGuard)
export class GifController {
  constructor(private gifService: GifService) {}

  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.gifService.search(q || '', limit ? parseInt(limit, 10) : 20);
  }

  @Get('trending')
  trending(@Query('limit') limit?: string) {
    return this.gifService.trending(limit ? parseInt(limit, 10) : 20);
  }
}
