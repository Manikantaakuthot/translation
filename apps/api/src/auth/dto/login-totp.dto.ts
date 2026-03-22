import { IsString, Matches, Length } from 'class-validator';

export class LoginTotpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone: string;

  @IsString()
  password: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  totpCode: string;
}
