import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedRequest } from '../common/roles';
import { AccountService } from './account.service';

export class DeletionRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class DeletionConfirmDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Confirmação inválida ou expirada' })
  confirmationToken!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('me/account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** Etapa 1: confirma a senha e devolve o token da etapa 2. */
  @Post('deletion-request')
  @HttpCode(200)
  request(@Req() req: AuthedRequest, @Body() dto: DeletionRequestDto) {
    return this.account.requestDeletion(req.user.id, dto.password);
  }

  /** Etapa 2: confirmação final, executa a anonimização. */
  @Post('deletion-confirm')
  @HttpCode(200)
  confirm(@Req() req: AuthedRequest, @Body() dto: DeletionConfirmDto) {
    return this.account.confirmDeletion(req.user.id, dto.confirmationToken);
  }
}
