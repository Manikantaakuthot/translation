import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { Status, StatusSchema } from './schemas/status.schema';
import { Contact, ContactSchema } from '../users/schemas/contact.schema';
import { Conversation, ConversationSchema } from '../conversations/schemas/conversation.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Status.name, schema: StatusSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    EventsModule,
  ],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
