import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsBrPhone, IsCpf, IsStrongPasswordFs } from '../../common/validators';

/** "" e espaços viram null: campo vazio = remover o dado (nunca "CPF inválido"). */
const emptyToNull = () =>
  Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );
const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsStrongPasswordFs()
  password!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @emptyToNull()
  @IsBrPhone()
  phone?: string | null;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class Verify2faDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class Setup2faDto {
  @IsIn(['TOTP', 'SMS'])
  method!: 'TOTP' | 'SMS';

  @IsOptional()
  @IsString()
  phone?: string;
}

export class Confirm2faDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Token de redefinição inválido ou expirado',
  })
  token!: string;

  @IsStrongPasswordFs()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  biometricEnabled?: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres' })
  @MaxLength(120)
  name?: string;

  // Aceita "(11) 98765-4321", "11987654321" ou "+5511987654321". null/"" remove.
  @IsOptional()
  @emptyToNull()
  @IsBrPhone()
  phone?: string | null;

  // Aceita "529.982.247-25" ou "52998224725"; valida dígitos verificadores. null/"" remove.
  @IsOptional()
  @emptyToNull()
  @IsCpf()
  cpf?: string | null;
}

export class RevokeSessionsDto {
  @IsOptional()
  @IsString()
  currentRefreshToken?: string;
}

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsString()
  @Matches(/^\d{8}$/, { message: 'CEP deve ter 8 dígitos' })
  cep!: string;

  @IsString()
  @MinLength(2)
  street!: string;

  @IsString()
  @MinLength(1)
  number!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  @MinLength(2)
  neighborhood!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsString()
  @Length(2, 2)
  state!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/)
  cep?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  street?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  number?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
