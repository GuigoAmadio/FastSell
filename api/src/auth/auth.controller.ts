import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AuthService } from './auth.service';
import {
  Confirm2faDto,
  CreateAddressDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  RevokeSessionsDto,
  Setup2faDto,
  UpdateAddressDto,
  UpdateProfileDto,
  UpdateSettingsDto,
  Verify2faDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AddressesService } from './addresses.service';

type AuthedRequest = Request & { user: { id: string } };

function clientMeta(req: Request) {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
  const userAgent = req.headers['user-agent'];
  return { ip, userAgent };
}

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly addresses: AddressesService,
  ) {}

  @Post('auth/register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, clientMeta(req));
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const meta = clientMeta(req);
    return this.auth.login(dto, meta.ip, meta.userAgent);
  }

  @Post('auth/2fa/verify')
  verify2fa(@Body() dto: Verify2faDto, @Req() req: Request) {
    return this.auth.verify2fa(dto, clientMeta(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/2fa/setup')
  setup2fa(@Req() req: AuthedRequest, @Body() dto: Setup2faDto) {
    return this.auth.setup2fa(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/2fa/confirm')
  confirm2fa(@Req() req: AuthedRequest, @Body() dto: Confirm2faDto) {
    return this.auth.confirm2fa(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/2fa/disable')
  disable2fa(@Req() req: AuthedRequest) {
    return this.auth.disable2fa(req.user.id);
  }

  @Post('auth/forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('auth/reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post('auth/refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, clientMeta(req));
  }

  @Post('auth/logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype);
        if (!ok) {
          cb(new Error('Apenas PNG/JPG até 5MB') as never, false);
          return;
        }
        cb(null, true);
      },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'avatars');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const userId = (req as AuthedRequest).user.id;
          cb(null, `${userId}${extname(file.originalname).toLowerCase() || '.jpg'}`);
        },
      }),
    }),
  )
  async uploadPhoto(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo obrigatório');
    const photoUrl = `/uploads/avatars/${file.filename}`;
    return this.auth.updatePhoto(req.user.id, photoUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/settings')
  getSettings(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/settings')
  updateSettings(@Req() req: AuthedRequest, @Body() dto: UpdateSettingsDto) {
    return this.auth.updateSettings(req.user.id, dto.biometricEnabled);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/sessions')
  listSessions(@Req() req: AuthedRequest, @Body() _body?: RevokeSessionsDto) {
    const current =
      (req.headers['x-refresh-token'] as string) || undefined;
    return this.auth.listSessions(req.user.id, current);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/sessions/:id')
  revokeSession(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.auth.revokeSession(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/sessions')
  revokeAllSessions(@Req() req: AuthedRequest, @Body() dto: RevokeSessionsDto) {
    return this.auth.revokeAllSessions(
      req.user.id,
      dto.currentRefreshToken ||
        (req.headers['x-refresh-token'] as string) ||
        undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/addresses')
  listAddresses(@Req() req: AuthedRequest) {
    return this.addresses.list(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/addresses')
  createAddress(@Req() req: AuthedRequest, @Body() dto: CreateAddressDto) {
    return this.addresses.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/addresses/:id')
  updateAddress(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/addresses/:id')
  deleteAddress(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.addresses.remove(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/addresses/:id/default')
  setDefaultAddress(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.addresses.setDefault(req.user.id, id);
  }
}
