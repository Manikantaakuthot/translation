import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GroupsController, GroupsInviteController } from './groups.controller';
import { GroupsService } from './groups.service';
import { Conversation, ConversationSchema } from '../conversations/schemas/conversation.schema';
import { Group, GroupSchema } from '../conversations/schemas/group.schema';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Group.name, schema: GroupSchema },
    ]),
    EventsModule,
  ],
  controllers: [GroupsController, GroupsInviteController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
