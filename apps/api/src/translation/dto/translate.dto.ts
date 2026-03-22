import { IsString, IsOptional, Length } from 'class-validator';

export class TranslateDto {
  @IsString()
  @Length(1, 5000)
  text: string;

  @IsString()
  @Length(2, 5)
  targetLanguage: string;

  @IsString()
  @IsOptional()
  @Length(2, 5)
  sourceLanguage?: string;
}
