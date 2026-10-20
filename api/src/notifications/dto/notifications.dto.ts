import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** PATCH parcial: cada checkbox é salvo sozinho, sem tocar nos demais. */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  promotionsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ordersEnabled?: boolean;
}

export class PromotionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  message!: string;
}
