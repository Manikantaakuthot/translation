import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { randomInt, createHash } from 'crypto';
import type { Request } from 'express';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PhoneReverseIndex, PhoneReverseIndexDocument } from '../users/schemas/phone-reverse-index.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RedisService } from '../redis/redis.service';
import { PushService } from '../push/push.service';
import { DeviceSession, DeviceSessionDocument } from './schemas/device-session.schema';
import { RefreshRotatingDto } from './dto/refresh-rotating.dto';

/** Strip whitespace and leading + so +91628… and 91628… and 628… all normalize the same way */
function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^\+/, '');
}

/**
 * Build a fully-normalized phone from local number + country code.
 * e.g. countryCode="+91", phone="6281516349" → "916281516349"
 */
function buildFullPhone(phone: string, countryCode?: string): string {
  const stripped = normalizePhone(phone);
  if (!countryCode) return stripped;
  const cc = normalizePhone(countryCode); // e.g. "+91" → "91"
  if (!cc) return stripped; // empty string after normalization (e.g. countryCode was "" or "+")
  // Avoid double-prepending if phone already starts with country code
  if (stripped.startsWith(cc)) return stripped;
  return cc + stripped;
}

const OTP_TTL = 300; // 5 minutes
const OTP_PREFIX = 'otp:';
const RESET_OTP_PREFIX = 'reset-otp:';
const TOKEN_BLACKLIST_PREFIX = 'blacklist:';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PhoneReverseIndex.name) private phoneReverseIndexModel: Model<PhoneReverseIndexDocument>,
    @InjectModel(DeviceSession.name) private deviceSessionModel: Model<DeviceSessionDocument>,
    private jwtService: JwtService,
    private redis: RedisService,
    private pushService: PushService,
  ) {}

  async register(dto: RegisterDto, req?: Request) {
    // Store the full phone (countryCode + local number) so e.g. +91 6281516349 → "916281516349"
    const normalizedPhone = buildFullPhone(dto.phone, dto.countryCode);
    // Look up by full phone OR legacy formats (with + prefix, or just local number)
    const existing = await this.userModel.findOne({
      $or: [
        { phone: normalizedPhone },
        { phone: `+${normalizedPhone}` },
        { phone: normalizePhone(dto.phone) }, // just local number
      ],
    });
    if (existing) {
      // Detect both new-style ghosts (isGuest: true) and old-style ghosts
      // (isGuest field missing AND lastSeen null — created before isGuest was added)
      const isGhostAccount =
        (existing as any).isGuest === true ||
        ((existing as any).isGuest == null && existing.lastSeen == null);

      if (!isGhostAccount) {
        throw new UnauthorizedException('Phone number already registered');
      }
      // Ghost account exists → upgrade it in place (SAME ID preserved).
      // All conversations and contacts that reference this ID remain valid.
      const passwordHash = await bcrypt.hash(dto.password, 10);
      existing.passwordHash = passwordHash;
      existing.name = dto.name;
      existing.countryCode = dto.countryCode;
      (existing as any).isGuest = false; // explicitly set so it's never treated as ghost again
      await existing.save();
      return this.generateTokens(existing, req);
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      phone: normalizedPhone,
      countryCode: dto.countryCode,
      name: dto.name,
      passwordHash,
      isGuest: false,
    });
    // Notify contacts who synced this number that their friend just joined
    this.notifyFriendJoined(user._id.toString(), normalizedPhone, dto.name).catch(
      (err) => console.error('[Auth] friend-joined notification failed:', err),
    );
    return this.generateTokens(user, req);
  }

  async sendOtp(phone: string): Promise<{ success: boolean; otp?: string }> {
    const otp = String(randomInt(100000, 999999));
    const key = `${OTP_PREFIX}${normalizePhone(phone)}`;
    await this.redis.set(key, otp, OTP_TTL);

    let smsSent = false;
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE) {
      try {
        // Resolve the best E.164 number to dial — use the stored normalized phone
        // (which has the full country code) rather than the raw entered phone
        let recipientPhone = phone.startsWith('+') ? phone : `+${phone}`;
        const existingUser = await this.findUserByPhone(phone);
        if (existingUser?.phone) {
          const p = existingUser.phone;
          recipientPhone = p.startsWith('+') ? p : `+${p}`;
        }
        // Dynamically require twilio only when credentials are present
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: `Your MQ verification code is: ${otp}`,
          from: process.env.TWILIO_PHONE,
          to: recipientPhone,
        });
        smsSent = true;
        console.log(`[OTP] SMS sent via Twilio to ${recipientPhone}`);
      } catch (err: any) {
        console.error(`[OTP] Twilio SMS failed: ${err?.message} — falling back to response`);
        smsSent = false;
      }
    }

    // Log OTP to server console for development / when SMS failed
    if (!smsSent) {
      console.log(`[OTP] Phone: ${phone} | Code: ${otp}`);
    }

    // Return OTP in response when SMS was not successfully sent
    return { success: true, ...(!smsSent && { otp }) };
  }

  async verifyOtp(phone: string, otp: string, name?: string, countryCode?: string, req?: Request) {
    const key = `${OTP_PREFIX}${normalizePhone(phone)}`;
    const stored = await this.redis.get(key);
    if (!stored || stored !== otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    await this.redis.del(key);
    let user = await this.findUserByPhone(phone);
    if (user) {
      // If the existing account is a guest and we have registration info, upgrade it
      if ((user as any).isGuest && name && countryCode) {
        user.name = name;
        user.countryCode = countryCode;
        (user as any).isGuest = false;
        await user.save();
      }
      return this.generateTokens(user, req);
    }
    if (!name || !countryCode) {
      throw new UnauthorizedException('New user: name and countryCode required');
    }
    const passwordHash = await bcrypt.hash(randomInt(1e12).toString(), 10);
    const fullPhone = buildFullPhone(phone, countryCode);
    user = await this.userModel.create({
      phone: fullPhone,
      countryCode,
      name,
      passwordHash,
      isGuest: false,
    });
    return this.generateTokens(user, req);
  }

  async blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
    const key = `${TOKEN_BLACKLIST_PREFIX}${token}`;
    await this.redis.set(key, '1', expiresInSeconds);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = `${TOKEN_BLACKLIST_PREFIX}${token}`;
    return this.redis.exists(key);
  }

  /** Find a user by phone — tries exact match first, then regex fallback for legacy data */
  private async findUserByPhone(phone: string): Promise<UserDocument | null> {
    const stripped = normalizePhone(phone); // e.g. "6281516349" or "916281516349"
    const withPlus = `+${stripped}`; // e.g. "+6281516349" or "+916281516349"

    // 1) Try exact matches first (most reliable — avoids wrong-user collisions)
    const exact = await this.userModel.findOne({
      $or: [{ phone: stripped }, { phone: withPlus }],
    });
    if (exact) return exact;

    // 2) Fallback: regex suffix match for cross-format lookups
    if (stripped.length >= 7 && stripped.length <= 10) {
      const regexMatch = await this.userModel.findOne({
        phone: { $regex: new RegExp(`${stripped}$`) },
      });
      if (regexMatch) return regexMatch;
    }

    // 3) For international numbers (>10 digits), try suffix match on the local part (last 10 digits)
    if (stripped.length > 10) {
      const localPart = stripped.slice(-10);
      const regexMatch = await this.userModel.findOne({
        phone: { $regex: new RegExp(`${localPart}$`) },
      });
      if (regexMatch) return regexMatch;
    }

    return null;
  }

  async login(dto: LoginDto, req?: Request) {
    const user = await this.findUserByPhone(dto.phone);
    if (!user) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException('Use OTP to sign in');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    if (user.totpEnabled) {
      return { requiresTotp: true, phone: user.phone };
    }
    // Refresh FCM token on every login so stale tokens are replaced
    if (dto.fcmToken) {
      this.pushService.refreshFcmToken(
        user._id.toString(),
        dto.fcmToken,
        dto.platform || 'android',
      ).catch((err) => console.error('[Auth] FCM token refresh failed:', err));
    }
    return this.generateTokens(user, req);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getIp(req?: Request): string | undefined {
    if (!req) return undefined;
    const xf = (req.headers['x-forwarded-for'] as string | undefined) || '';
    const first = xf.split(',')[0]?.trim();
    return first || (req.ip || (req.connection as any)?.remoteAddress);
  }

  private parseUserAgent(ua: string | undefined) {
    const s = ua || '';
    // lightweight parsing; good enough for device list display
    const browser =
      s.includes('Chrome') ? 'Chrome' :
      s.includes('Safari') ? 'Safari' :
      s.includes('Firefox') ? 'Firefox' :
      s.includes('Edg') ? 'Edge' :
      s ? 'Browser' : undefined;
    const os =
      s.includes('Windows') ? 'Windows' :
      s.includes('Mac OS') ? 'macOS' :
      s.includes('Android') ? 'Android' :
      s.includes('iPhone') || s.includes('iPad') ? 'iOS' :
      s ? 'OS' : undefined;
    return { browser, os };
  }

  private async upsertDeviceSession(userId: string, req?: Request): Promise<DeviceSessionDocument> {
    const ua = req?.headers['user-agent'] as string | undefined;
    const { browser, os } = this.parseUserAgent(ua);
    const ip = this.getIp(req);

    // One active session per (user, deviceType, browser, os, ip) for now.
    // Later phases can introduce explicit device IDs and QR linking.
    const deviceType: any = 'web';
    const deviceName = browser && os ? `${browser} on ${os}` : 'Web';

    const existing = await this.deviceSessionModel.findOne({
      userId: new Types.ObjectId(userId),
      deviceType,
      browser,
      os,
      ip,
      isActive: true,
      revokedAt: { $exists: false },
    });
    if (existing) {
      existing.lastActive = new Date();
      await existing.save();
      return existing;
    }
    return this.deviceSessionModel.create({
      userId: new Types.ObjectId(userId),
      deviceName,
      deviceType,
      browser,
      os,
      ip,
      isActive: true,
      linkedAt: new Date(),
      lastActive: new Date(),
    });
  }

  async refreshRotating(dto: RefreshRotatingDto, req?: Request) {
    // 1) Verify refresh token signature & exp
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.refreshToken, { ignoreExpiration: false });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = payload.sub as string;
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    // 2) Find device session by refresh token hash (current token must match stored)
    const tokenHash = this.hashToken(dto.refreshToken);
    const session = await this.deviceSessionModel.findOne({
      userId: new Types.ObjectId(userId),
      refreshTokenHash: tokenHash,
      isActive: true,
      revokedAt: { $exists: false },
    });
    if (!session) {
      // Reuse detection: token valid but not recognized → revoke all sessions
      await this.revokeAllDeviceSessions(userId);
      throw new UnauthorizedException('Refresh token reuse detected. All sessions revoked.');
    }

    // 3) Rotate token: mint new tokens & update session hash
    const { accessToken, refreshToken } = await this.generateTokens(user, req, session._id.toString());
    return { accessToken, refreshToken, user: this.sanitizeUser(user), deviceSessionId: session._id.toString() };
  }

  private async notifyFriendJoined(userId: string, normalizedPhone: string, name: string) {
    // Try the full phone and the local part (last 10 digits) to cover all stored formats
    const candidates = [normalizedPhone];
    if (normalizedPhone.length > 10) {
      candidates.push(normalizedPhone.slice(-10));
    }
    const hashes = candidates.map((p) => createHash('sha256').update(p).digest('hex'));
    const entries = await this.phoneReverseIndexModel
      .find({ phoneHash: { $in: hashes } })
      .lean();
    const notifyIds = new Set<string>();
    for (const entry of entries) {
      for (const id of (entry as any).syncedBy || []) {
        const sid = id.toString();
        if (sid !== userId) notifyIds.add(sid);
      }
    }
    await Promise.all(
      [...notifyIds].map((id) =>
        this.pushService.sendToUser(
          id,
          { title: `${name} just joined MSG!`, body: 'Tap to say hello 👋' },
          { type: 'friend_joined', userId },
        ),
      ),
    );
  }

  private async generateTokens(user: UserDocument, req?: Request, existingSessionId?: string) {
    const payload = { sub: user._id.toString(), phone: user.phone };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    const session = existingSessionId
      ? await this.deviceSessionModel.findById(existingSessionId)
      : await this.upsertDeviceSession(user._id.toString(), req);

    if (session) {
      session.refreshTokenHash = this.hashToken(refreshToken);
      session.refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      session.lastActive = new Date();
      session.isActive = true;
      await session.save();
    }
    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
      deviceSessionId: session?._id?.toString(),
    };
  }

  async listDeviceSessions(userId: string) {
    const sessions = await this.deviceSessionModel
      .find({ userId: new Types.ObjectId(userId), isActive: true })
      .sort({ lastActive: -1 })
      .lean();
    return (sessions || []).map((s: any) => ({
      id: s._id.toString(),
      deviceName: s.deviceName,
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      ip: s.ip,
      lastActive: s.lastActive,
      linkedAt: s.linkedAt,
      revokedAt: s.revokedAt,
    }));
  }

  async revokeDeviceSession(userId: string, sessionId: string) {
    const session = await this.deviceSessionModel.findOne({ _id: new Types.ObjectId(sessionId), userId: new Types.ObjectId(userId) });
    if (!session) throw new ForbiddenException('Device session not found');
    await this.deviceSessionModel.updateOne(
      { _id: session._id },
      { $set: { revokedAt: new Date(), isActive: false, unlinkedAt: new Date(), refreshTokenHash: null } as any },
    );
    return { success: true };
  }

  async revokeAllDeviceSessions(userId: string) {
    await this.deviceSessionModel.updateMany(
      { userId: new Types.ObjectId(userId), isActive: true },
      { $set: { revokedAt: new Date(), isActive: false, unlinkedAt: new Date(), refreshTokenHash: null } as any },
    );
    return { success: true };
  }

  sanitizeUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      phone: user.phone,
      countryCode: user.countryCode,
      name: user.name,
      profilePictureUrl: user.profilePictureUrl,
      statusText: user.statusText,
      lastSeen: user.lastSeen,
      isOnline: user.isOnline,
      preferredLanguage: (user as any).preferredLanguage || 'en',
      autoTranslateMessages: (user as any).autoTranslateMessages || false,
      autoTranslateCalls: (user as any).autoTranslateCalls || false,
    };
  }

  async validateUser(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId);
  }

  async setup2fa(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    const secret = speakeasy.generateSecret({
      name: `MSG (${user.phone})`,
      length: 20,
    });
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { totpSecret: secret.base32, totpEnabled: false } },
    );
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);
    return { secret: secret.base32, qrCode };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.userModel.findById(userId);
    if (!user?.totpSecret) throw new UnauthorizedException('Run 2FA setup first');
    const valid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
    if (!valid) throw new UnauthorizedException('Invalid code');
    await this.userModel.updateOne({ _id: userId }, { $set: { totpEnabled: true } });
    return { success: true };
  }

  async disable2fa(userId: string, code: string) {
    const user = await this.userModel.findById(userId);
    if (!user?.totpEnabled) throw new UnauthorizedException('2FA not enabled');
    const valid = speakeasy.totp.verify({
      secret: user.totpSecret!,
      encoding: 'base32',
      token: code,
      window: 1,
    });
    if (!valid) throw new UnauthorizedException('Invalid code');
    await this.userModel.updateOne(
      { _id: userId },
      { $unset: { totpSecret: 1 }, $set: { totpEnabled: false } },
    );
    return { success: true };
  }

  async loginWithTotp(phone: string, password: string, totpCode: string) {
    const user = await this.findUserByPhone(phone);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.passwordHash) throw new UnauthorizedException('Use OTP to sign in');
    const validPass = await bcrypt.compare(password, user.passwordHash);
    if (!validPass) throw new UnauthorizedException('Invalid credentials');
    if (!user.totpEnabled || !user.totpSecret) {
      return this.generateTokens(user);
    }
    const validTotp = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
    if (!validTotp) throw new UnauthorizedException('Invalid 2FA code');
    return this.generateTokens(user);
  }

  // Forgot Password - Send OTP for password reset
  async sendResetOtp(phone: string): Promise<{ success: boolean; otp?: string; exists: boolean }> {
    const user = await this.findUserByPhone(phone);
    if (!user) {
      return { success: false, exists: false };
    }

    const otp = String(randomInt(100000, 999999));
    const key = `${RESET_OTP_PREFIX}${normalizePhone(phone)}`;
    await this.redis.set(key, otp, OTP_TTL);

    let smsSentReset = false;
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE) {
      try {
        // Use stored normalized phone (with country code) for Twilio delivery
        const storedPhone = user.phone;
        const recipientPhone = storedPhone.startsWith('+') ? storedPhone : `+${storedPhone}`;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: `Your MQ password reset code is: ${otp}`,
          from: process.env.TWILIO_PHONE,
          to: recipientPhone,
        });
        smsSentReset = true;
        console.log(`[RESET OTP] SMS sent via Twilio to ${recipientPhone}`);
      } catch (err: any) {
        console.error(`[RESET OTP] Twilio SMS failed: ${err?.message} — falling back to response`);
        smsSentReset = false;
      }
    }

    if (!smsSentReset) {
      console.log(`[RESET OTP] Phone: ${phone} | Code: ${otp}`);
    }

    return { success: true, exists: true, ...(!smsSentReset && { otp }) };
  }

  // Verify reset OTP and return a temporary token
  async verifyResetOtp(phone: string, otp: string): Promise<{ success: boolean; resetToken?: string }> {
    const key = `${RESET_OTP_PREFIX}${normalizePhone(phone)}`;
    const stored = await this.redis.get(key);
    if (!stored || stored !== otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Generate a temporary reset token (valid for 10 minutes)
    const resetToken = this.jwtService.sign(
      { phone, purpose: 'password-reset' },
      { expiresIn: '10m' },
    );

    return { success: true, resetToken };
  }

  // Reset password using the reset token
  async resetPassword(resetToken: string, newPassword: string): Promise<{ success: boolean }> {
    try {
      const payload = this.jwtService.verify(resetToken);
      if (payload.purpose !== 'password-reset') {
        throw new UnauthorizedException('Invalid reset token');
      }

      const user = await this.userModel.findOne({ phone: payload.phone });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Delete the OTP key after successful verification
      const otpKey = `${RESET_OTP_PREFIX}${payload.phone}`;
      await this.redis.del(otpKey);

      // Hash and update the new password
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { passwordHash } },
      );

      return { success: true };
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }
}
