import { IsString, Matches, Length, IsOptional } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number' })
  phone: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/, { message: 'OTP must be 6 digits' })
  otp: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5)
  countryCode?: string;
}
