import { IsString, Length } from 'class-validator';

export class TtsDto {
  @IsString()
  @Length(1, 5000)
  text: string;

  @IsString()
  @Length(2, 5)
  language: string;
}
