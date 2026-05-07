import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsUUID,
} from 'class-validator';

export class PatchFeatureFlagDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  forcedOnUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  forcedOffUserIds?: string[];
}

export class PatchExperimentDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  variants?: string[];

  @IsOptional()
  @IsObject()
  trafficSplit?: Record<string, number>;
}

export class TrackProductEventDto {
  @IsString()
  @MaxLength(128)
  eventName!: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class CreateFeatureFlagDto {
  @IsString()
  @MaxLength(128)
  key!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;
}

export class CreateExperimentDto {
  @IsString()
  @MaxLength(128)
  key!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  variants?: string[];

  @IsOptional()
  @IsObject()
  trafficSplit?: Record<string, number>;
}

export class StartGrowthCheckoutDto {
  @IsIn(['pro'])
  plan!: 'pro';

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  anonSessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  experimentKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  variant?: string;
}
