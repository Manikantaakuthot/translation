import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User, UserSchema } from './schemas/user.schema';
import { Contact, ContactSchema } from './schemas/contact.schema';
import { PhoneReverseIndex, PhoneReverseIndexSchema } from './schemas/phone-reverse-index.schema';
import { Conversation, ConversationSchema } from '../conversations/schemas/conversation.schema';
import { Message, MessageSchema } from '../messages/schemas/message.schema';
import { Call, CallSchema } from '../calls/schemas/call.schema';
import { Status, StatusSchema } from '../status/schemas/status.schema';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: PhoneReverseIndex.name, schema: PhoneReverseIndexSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Call.name, schema: CallSchema },
      { name: Status.name, schema: StatusSchema },
    ]),
    AuthModule,
    PushModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
