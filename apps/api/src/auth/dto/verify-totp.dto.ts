import { IsString, Length, Matches } from 'class-validator';

export class VerifyTotpDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/, { message: 'Code must be 6 digits' })
  code: string;
}
