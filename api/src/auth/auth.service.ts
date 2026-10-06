import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TwoFactorMethod, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SmsService } from '../sms/sms.service';
import {
  Confirm2faDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  Setup2faDto,
  UpdateProfileDto,
  Verify2faDto,
} from './dto/auth.dto';

type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  cpf: string | null;
  photoUrl: string | null;
  biometricEnabled: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod | null;
};

type TokenMeta = { ip?: string; userAgent?: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      cpf: user.cpf,
      photoUrl: user.photoUrl,
      biometricEnabled: user.biometricEnabled,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private deriveDeviceLabel(userAgent?: string): string | null {
    if (!userAgent) {
      return null;
    }

    const ua = userAgent.toLowerCase();
    let browser = 'Browser';
    if (ua.includes('edg/') || ua.includes('edge')) {
      browser = 'Edge';
    } else if (ua.includes('chrome') || ua.includes('crios')) {
      browser = 'Chrome';
    } else if (ua.includes('firefox') || ua.includes('fxios')) {
      browser = 'Firefox';
    } else if (ua.includes('safari')) {
      browser = 'Safari';
    } else if (ua.includes('dart') || ua.includes('flutter')) {
      browser = 'App';
    }

    let os = '';
    if (ua.includes('android')) {
      os = 'Android';
    } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
      os = 'iOS';
    } else if (ua.includes('windows')) {
      os = 'Windows';
    } else if (ua.includes('mac os') || ua.includes('macintosh')) {
      os = 'macOS';
    } else if (ua.includes('linux')) {
      os = 'Linux';
    }

    return os ? `${browser} · ${os}` : browser;
  }

  private async issueTokens(user: User, meta?: TokenMeta) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    });

    const refreshToken = randomBytes(48).toString('hex');
    const days = Number(this.config.get('JWT_REFRESH_TTL_DAYS', 30));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        deviceLabel: this.deriveDeviceLabel(meta?.userAgent),
        lastUsedAt: new Date(),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      user: this.toPublic(user),
    };
  }

  async register(dto: RegisterDto, meta?: TokenMeta) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        phone: dto.phone,
      },
    });

    return this.issueTokens(user, meta);
  }

  private lockKey(userId: string) {
    return `login:lock:${userId}`;
  }

  private failUserKey(userId: string) {
    return `login:fail:${userId}`;
  }

  private failIpKey(ip: string) {
    return `login:fail:ip:${ip}`;
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      const lockedTtl = await this.redis.ttl(this.lockKey(user.id));
      if (lockedTtl > 0) {
        throw new ForbiddenException({
          message: 'Conta temporariamente bloqueada por tentativas incorretas',
          lockRemainingSeconds: lockedTtl,
        });
      }
    }

    const valid = user ? await argon2.verify(user.passwordHash, dto.password) : false;

    if (!user || !valid) {
      if (user) {
        await this.registerFailedLogin(user, email, ip, 'invalid_password');
      } else {
        await this.prisma.loginAttempt.create({
          data: { email, ip, success: false, reason: 'user_not_found' },
        });
      }
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    await this.prisma.loginAttempt.create({
      data: { userId: user.id, email, ip, success: true },
    });
    await this.redis.del(this.failUserKey(user.id));
    if (ip) {
      await this.redis.del(this.failIpKey(ip));
    }

    if (user.twoFactorEnabled) {
      return this.start2faChallenge(user);
    }

    return this.issueTokens(user, { ip, userAgent });
  }

  private async registerFailedLogin(
    user: User,
    email: string,
    ip: string | undefined,
    reason: string,
  ) {
    await this.prisma.loginAttempt.create({
      data: { userId: user.id, email, ip, success: false, reason },
    });

    const maxAttempts = Number(this.config.get('LOGIN_MAX_ATTEMPTS', 5));
    const lockSeconds = Number(this.config.get('LOGIN_LOCKOUT_SECONDS', 900));
    const fails = await this.redis.incrWithTtl(this.failUserKey(user.id), lockSeconds);
    if (ip) {
      await this.redis.incrWithTtl(this.failIpKey(ip), lockSeconds);
    }

    if (fails >= maxAttempts) {
      await this.redis.setex(this.lockKey(user.id), lockSeconds, '1');
      await this.redis.del(this.failUserKey(user.id));
      await this.mail.send(
        user.email,
        'Alerta de segurança — FastSell',
        this.mail.lockoutAlertHtml(user.name, Math.ceil(lockSeconds / 60)),
      );
    }
  }

  private async start2faChallenge(user: User) {
    const challengeId = randomBytes(24).toString('hex');
    const ttl = Number(this.config.get('OTP_TTL_SECONDS', 300));
    const payload = {
      userId: user.id,
      method: user.twoFactorMethod,
      attempts: 0,
    };

    await this.redis.setex(`2fa:challenge:${challengeId}`, ttl, JSON.stringify(payload));

    if (user.twoFactorMethod === TwoFactorMethod.SMS) {
      if (!user.phone) {
        throw new BadRequestException('Telefone não cadastrado para SMS OTP');
      }
      const code = String(randomInt(100000, 999999));
      await this.redis.setex(`2fa:sms:${challengeId}`, ttl, code);
      await this.sms.sendOtp(user.phone, code);
    }

    return {
      requires2fa: true as const,
      challengeId,
      method: user.twoFactorMethod,
      expiresInSeconds: ttl,
    };
  }

  async verify2fa(dto: Verify2faDto, meta?: TokenMeta) {
    const key = `2fa:challenge:${dto.challengeId}`;
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException('Desafio 2FA expirado ou inválido');
    }

    const challenge = JSON.parse(raw) as {
      userId: string;
      method: TwoFactorMethod;
      attempts: number;
    };

    const maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS', 3));
    if (challenge.attempts >= maxAttempts) {
      await this.redis.del(key, `2fa:sms:${dto.challengeId}`);
      throw new ForbiddenException('Bloqueio temporário: 3 tentativas incorretas de OTP');
    }

    const user = await this.prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.twoFactorEnabled) {
      throw new UnauthorizedException('Usuário inválido');
    }

    let ok = false;
    if (challenge.method === TwoFactorMethod.TOTP) {
      if (!user.totpSecret) {
        throw new BadRequestException('TOTP não configurado');
      }
      ok = authenticator.verify({ token: dto.code, secret: user.totpSecret });
    } else {
      const smsCode = await this.redis.get(`2fa:sms:${dto.challengeId}`);
      ok = !!smsCode && smsCode === dto.code;
    }

    if (!ok) {
      challenge.attempts += 1;
      const ttl = await this.redis.ttl(key);
      await this.redis.setex(key, Math.max(ttl, 1), JSON.stringify(challenge));
      if (challenge.attempts >= maxAttempts) {
        await this.redis.del(key, `2fa:sms:${dto.challengeId}`);
        throw new ForbiddenException('Bloqueio temporário: 3 tentativas incorretas de OTP');
      }
      throw new UnauthorizedException('Código OTP inválido');
    }

    await this.redis.del(key, `2fa:sms:${dto.challengeId}`);
    return this.issueTokens(user, meta);
  }

  async setup2fa(userId: string, dto: Setup2faDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (dto.method === 'SMS') {
      const phone = dto.phone || user.phone;
      if (!phone) {
        throw new BadRequestException('Informe o telefone para SMS OTP');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { phone, twoFactorMethod: TwoFactorMethod.SMS },
      });

      const setupId = randomBytes(16).toString('hex');
      const code = String(randomInt(100000, 999999));
      const ttl = Number(this.config.get('OTP_TTL_SECONDS', 300));
      await this.redis.setex(`2fa:setup:${userId}`, ttl, JSON.stringify({ setupId, method: 'SMS', code }));
      await this.sms.sendOtp(phone, code);

      return { method: 'SMS' as const, setupId, expiresInSeconds: ttl };
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'FastSell', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
    const ttl = Number(this.config.get('OTP_TTL_SECONDS', 300));
    await this.redis.setex(
      `2fa:setup:${userId}`,
      ttl,
      JSON.stringify({ method: 'TOTP', secret }),
    );

    return {
      method: 'TOTP' as const,
      secret,
      otpauthUrl: otpauth,
      qrCodeDataUrl,
      expiresInSeconds: ttl,
    };
  }

  async confirm2fa(userId: string, dto: Confirm2faDto) {
    const raw = await this.redis.get(`2fa:setup:${userId}`);
    if (!raw) {
      throw new BadRequestException('Configuração 2FA expirada. Inicie novamente.');
    }

    const setup = JSON.parse(raw) as { method: string; secret?: string; code?: string };

    if (setup.method === 'TOTP') {
      const ok = authenticator.verify({ token: dto.code, secret: setup.secret! });
      if (!ok) {
        throw new UnauthorizedException('Código TOTP inválido');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorMethod: TwoFactorMethod.TOTP,
          totpSecret: setup.secret,
        },
      });
    } else {
      if (setup.code !== dto.code) {
        throw new UnauthorizedException('Código SMS inválido');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorMethod: TwoFactorMethod.SMS,
        },
      });
    }

    await this.redis.del(`2fa:setup:${userId}`);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: this.toPublic(user) };
  }

  async disable2fa(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorMethod: null,
        totpSecret: null,
      },
    });
    return { user: this.toPublic(user) };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return success to avoid user enumeration
    if (!user) {
      return { message: 'Se o e-mail existir, enviaremos um link de redefinição.' };
    }

    const token = randomBytes(32).toString('hex');
    const hours = Number(this.config.get('RESET_TOKEN_TTL_HOURS', 24));
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    const deepLink = this.config.get<string>('MOBILE_RESET_DEEP_LINK', 'fastsell://reset-password');
    const webLink = this.config.get<string>('FRONTEND_RESET_URL', 'http://localhost:3000/reset-password');
    const resetUrl = `${webLink}?token=${token}&deeplink=${encodeURIComponent(`${deepLink}?token=${token}`)}`;

    await this.mail.send(
      user.email,
      'Redefinição de senha — FastSell',
      this.mail.passwordResetHtml(user.name, resetUrl),
    );

    const expose =
      this.config.get('EXPOSE_DEV_TOKENS') === '1' ||
      process.env.NODE_ENV === 'test';

    return {
      message: 'Se o e-mail existir, enviaremos um link de redefinição.',
      ...(expose ? { resetToken: token } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token de redefinição inválido ou expirado');
    }

    const passwordHash = await argon2.hash(dto.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso' };
  }

  async refresh(refreshToken: string, meta?: TokenMeta) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.user, meta);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Logout ok' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: this.toPublic(user) };
  }

  async listSessions(userId: string, currentRefreshToken?: string) {
    const now = new Date();
    const currentHash = currentRefreshToken ? this.hashToken(currentRefreshToken) : null;

    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        deviceLabel: true,
        createdAt: true,
        lastUsedAt: true,
        tokenHash: true,
      },
    });

    return {
      sessions: sessions.map(({ tokenHash, ...session }) => ({
        ...session,
        isCurrent: currentHash !== null && tokenHash === currentHash,
      })),
    };
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    if (!session.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Sessão revogada' };
  }

  async revokeAllSessions(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken ? this.hashToken(currentRefreshToken) : null;

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });

    return { message: 'Sessões revogadas' };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.cpf !== undefined ? { cpf: dto.cpf } : {}),
      },
    });
    return { user: this.toPublic(user) };
  }

  async updatePhoto(userId: string, photoUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { photoUrl },
    });
    return { user: this.toPublic(user) };
  }

  async updateSettings(userId: string, biometricEnabled?: boolean) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(typeof biometricEnabled === 'boolean' ? { biometricEnabled } : {}),
      },
    });
    return { user: this.toPublic(user) };
  }
}
