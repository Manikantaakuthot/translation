import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshRotatingDto } from './dto/refresh-rotating.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyTotpDto } from './dto/verify-totp.dto';
import { LoginTotpDto } from './dto/login-totp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Req() req: Request, @Body() dto: RegisterDto) {
    return this.authService.register(dto, req);
  }

  @Post('login')
  async login(@Req() req: Request, @Body() dto: LoginDto) {
    return this.authService.login(dto, req);
  }

  @Post('send-otp')
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.phone);
  }

  @Post('verify-otp')
  async verifyOtp(@Req() req: Request, @Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.phone, dto.otp, dto.name, dto.countryCode, req);
  }

  @Post('login-totp')
  async loginTotp(@Body() dto: LoginTotpDto) {
    return this.authService.loginWithTotp(dto.phone, dto.password, dto.totpCode);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  async setup2fa(@CurrentUser() user: UserDocument) {
    return this.authService.setup2fa(user._id.toString());
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  async enable2fa(@CurrentUser() user: UserDocument, @Body() dto: VerifyTotpDto) {
    return this.authService.enable2fa(user._id.toString(), dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disable2fa(@CurrentUser() user: UserDocument, @Body() dto: VerifyTotpDto) {
    return this.authService.disable2fa(user._id.toString(), dto.code);
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Body() dto: RefreshRotatingDto) {
    return this.authService.refreshRotating(dto, req);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @CurrentUser() user: UserDocument) {
    const auth = req.headers.authorization;
    const token = auth?.replace('Bearer ', '');
    if (token) {
      await this.authService.blacklistToken(token, 15 * 60); // 15 min
    }
    return { success: true };
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  async listDevices(@CurrentUser() user: UserDocument) {
    return this.authService.listDeviceSessions(user._id.toString());
  }

  @Post('devices/:id/revoke')
  @UseGuards(JwtAuthGuard)
  async revokeDevice(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.authService.revokeDeviceSession(user._id.toString(), id);
  }

  @Post('devices/revoke-all')
  @UseGuards(JwtAuthGuard)
  async revokeAllDevices(@CurrentUser() user: UserDocument) {
    return this.authService.revokeAllDeviceSessions(user._id.toString());
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: { phone: string }) {
    return this.authService.sendResetOtp(dto.phone);
  }

  @Post('verify-reset-otp')
  async verifyResetOtp(@Body() dto: { phone: string; otp: string }) {
    return this.authService.verifyResetOtp(dto.phone, dto.otp);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: { resetToken: string; newPassword: string }) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword);
  }
}
