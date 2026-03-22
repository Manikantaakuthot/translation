import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DeviceInfoDto } from './device-info.dto';

export class RefreshRotatingDto extends DeviceInfoDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  /** Optional device session id if client already knows it */
  @IsOptional()
  @IsString()
  deviceSessionId?: string;
}

