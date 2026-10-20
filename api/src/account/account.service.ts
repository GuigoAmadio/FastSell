import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CONFIRM_TTL_SECONDS = 10 * 60;

/**
 * Campos pessoais removidos das cópias guardadas na tabela de auditoria.
 * (Os dados fiscais continuam na tabela Order; a auditoria não precisa duplicá-los.)
 */
const PII_KEYS = [
  'email',
  'name',
  'phone',
  'cpf',
  'photoUrl',
  'ip',
  'userAgent',
  'deviceLabel',
  'label',
  'cep',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'buyerName',
  'buyerCpf',
  'buyerEmail',
  'shippingAddress',
  'authorName',
  'totpSecret',
];

/**
 * US09 — exclusão de conta (LGPD) em duas etapas:
 *   1) POST /me/account/deletion-request com a senha -> token de confirmação (10 min);
 *   2) POST /me/account/deletion-confirm com o token -> anonimização.
 *
 * Decisão de modelo: a linha de User NÃO é apagada, é anonimizada. Pedidos
 * referenciam o usuário e guardam o snapshot fiscal (nome, CPF, endereço de
 * entrega, itens e valores), que precisa ser conservado por obrigação legal
 * (LGPD art. 16, I). Todo o resto é apagado ou desvinculado.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  private confirmKey(token: string) {
    return `account:delete:${createHash('sha256').update(token).digest('hex')}`;
  }

  async requestDeletion(userId: string, password: string) {
    // Limite de tentativas de senha nesta tela (independente do bloqueio de login).
    const attempts = await this.redis.incrWithTtl(
      `account:delete:attempts:${userId}`,
      900,
    );
    if (attempts > 5) {
      throw new HttpException(
        'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.deletedAt) throw new UnauthorizedException('Conta já excluída');
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Senha incorreta');
    }
    await this.redis.del(`account:delete:attempts:${userId}`);

    const token = randomBytes(32).toString('hex');
    await this.redis.setex(this.confirmKey(token), CONFIRM_TTL_SECONDS, userId);
    const ordersKept = await this.prisma.order.count({ where: { userId } });

    return {
      confirmationToken: token,
      expiresInSeconds: CONFIRM_TTL_SECONDS,
      ordersKept,
      message:
        'Confirme para excluir. Dados pessoais serão anonimizados; registros fiscais de pedidos são mantidos por obrigação legal.',
    };
  }

  async confirmDeletion(userId: string, token: string) {
    const key = this.confirmKey(token);
    const owner = await this.redis.get(key);
    // O token precisa ter sido emitido para ESTE usuário: ninguém exclui conta de terceiros.
    if (!owner || owner !== userId) {
      throw new BadRequestException(
        'Confirmação inválida ou expirada. Recomece a exclusão.',
      );
    }
    await this.redis.del(key);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { reviews: { include: { photos: true } } },
    });
    if (user.deletedAt) throw new BadRequestException('Conta já excluída');

    const originalEmail = user.email;
    const originalName = user.name;
    const filesToDelete = [
      user.photoUrl,
      ...user.reviews.flatMap((r) => r.photos.map((p) => p.url)),
    ];
    const anonEmail = `deleted+${user.id}@anon.fastsell.invalid`;
    const unusablePassword = await argon2.hash(randomBytes(32).toString('hex'));
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // 1) Dados sem valor fiscal: removidos.
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.address.deleteMany({ where: { userId } });
      await tx.favorite.deleteMany({ where: { userId } });
      await tx.cartItem.deleteMany({ where: { userId } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await tx.notificationDelivery.deleteMany({ where: { userId } });
      await tx.loginAttempt.updateMany({
        where: { OR: [{ userId }, { email: originalEmail }] },
        data: { email: null, ip: null },
      });

      // 2) Avaliações: nota e texto continuam (a média do produto não muda),
      //    mas sem autor identificável e sem fotos (podem mostrar a pessoa).
      await tx.reviewPhoto.deleteMany({ where: { review: { userId } } });
      await tx.review.updateMany({
        where: { userId },
        data: { authorName: 'Cliente' },
      });

      // 3) Pedidos: snapshot fiscal mantido; e-mail de contato não é dado fiscal.
      await tx.order.updateMany({
        where: { userId },
        data: { buyerEmail: null },
      });

      // 4) Usuário anonimizado: não loga mais, não recebe nada.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: anonEmail,
          name: null,
          phone: null,
          cpf: null,
          photoUrl: null,
          passwordHash: unusablePassword,
          biometricEnabled: false,
          twoFactorEnabled: false,
          twoFactorMethod: null,
          totpSecret: null,
          lockedUntil: null,
          role: 'CUSTOMER',
          deletedAt: now,
        },
      });

      // 5) Auditoria: os triggers guardam cópias das linhas (inclusive desta
      //    própria anonimização). Removemos os campos pessoais dessas cópias.
      await tx.$executeRaw`
        UPDATE "AuditLog"
        SET "oldData" = CASE WHEN "oldData" IS NULL THEN NULL
                             ELSE ("oldData" - ${PII_KEYS}::text[]) || '{"_anonymized": true}'::jsonb END,
            "newData" = CASE WHEN "newData" IS NULL THEN NULL
                             ELSE ("newData" - ${PII_KEYS}::text[]) || '{"_anonymized": true}'::jsonb END
        WHERE "rowId" = ${userId}
           OR "oldData"->>'userId' = ${userId}
           OR "newData"->>'userId' = ${userId}
           OR "oldData"->>'email' = ${originalEmail}
           OR "newData"->>'email' = ${originalEmail}
      `;
    });

    await Promise.all(filesToDelete.map((u) => this.storage.remove(u)));

    // E-mail de confirmação vai para o endereço original (último uso dele).
    try {
      await this.mail.send(
        originalEmail,
        'Sua conta FastSell foi excluída',
        this.mail.accountDeletedHtml(originalName),
      );
    } catch (err) {
      this.logger.error(
        `Falha ao enviar confirmação de exclusão: ${(err as Error).message}`,
      );
    }

    return {
      message: 'Conta excluída. Seus dados pessoais foram anonimizados.',
    };
  }
}
