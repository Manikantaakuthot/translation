import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagesController, MessagesControllerRoot } from './messages.controller';
import { MessagesService } from './messages.service';
import { Message, MessageSchema } from './schemas/message.schema';
import { Conversation, ConversationSchema } from '../conversations/schemas/conversation.schema';
import { EventsModule } from '../events/events.module';
import { TranslationModule } from '../translation/translation.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
    EventsModule,
    TranslationModule,
    PushModule,
  ],
  controllers: [MessagesController, MessagesControllerRoot],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
