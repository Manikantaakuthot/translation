import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeviceInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsIn(['web', 'desktop', 'mobile', 'tablet'])
  deviceType?: 'web' | 'desktop' | 'mobile' | 'tablet';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  browser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  os?: string;
}

