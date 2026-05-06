import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubscriptionStatus } from '../subscription.entity';

export class UpdateSubscriptionStatusDto {
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
