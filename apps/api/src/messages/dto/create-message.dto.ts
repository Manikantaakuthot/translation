import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsObject, IsArray } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsEnum(['text', 'image', 'video', 'audio', 'document', 'voice', 'location', 'contact', 'poll'])
  type: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsOptional()
  @IsBoolean()
  isViewOnce?: boolean;

  @IsOptional()
  @IsArray()
  mentions?: string[];

  @IsOptional()
  @IsObject()
  sharedContact?: { name: string; phone: string; email?: string; avatar?: string };

  @IsOptional()
  @IsObject()
  poll?: { question: string; options: { text: string; voters: string[] }[]; allowMultiple: boolean };

  @IsOptional()
  @IsObject()
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}
