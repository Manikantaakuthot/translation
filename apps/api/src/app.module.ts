import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { EventsModule } from './events/events.module';
import { MediaModule } from './media/media.module';
import { GroupsModule } from './groups/groups.module';
import { CallsModule } from './calls/calls.module';
import { StatusModule } from './status/status.module';
import { WebRtcModule } from './webrtc/webrtc.module';
import { PushModule } from './push/push.module';
import { TranslationModule } from './translation/translation.module';
import { GifModule } from './gif/gif.module';
import { StickersModule } from './stickers/stickers.module';
import { ChannelsModule } from './channels/channels.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 50 },
      { name: 'long', ttl: 60000, limit: 200 },
    ]),
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/msg'),
    AuthModule,
    UsersModule,
    ConversationsModule,
    MessagesModule,
    EventsModule,
    MediaModule,
    GroupsModule,
    CallsModule,
    StatusModule,
    WebRtcModule,
    PushModule,
    TranslationModule,
    GifModule,
    StickersModule,
    ChannelsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
