import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationCategory, NotificationChannel } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { UpdatePreferencesDto } from './dto/notifications.dto';
import {
  ALL_CHANNELS,
  DEFAULT_PREFERENCES,
  isAllowed,
  Preferences,
} from './notification-rules';

export const NOTIFICATIONS_QUEUE = 'fastsell-notifications';

type DeliveryJob = { deliveryId: string; text: string; html: string };

export type OutgoingMessage = {
  title: string;
  /** Texto curto (SMS/push). */
  text: string;
  /** Corpo HTML do e-mail; se ausente, gera um a partir do texto. */
  html?: string;
};

function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

/**
 * US08 — preferências + envio condicional por fila (BullMQ sobre o Redis que o
 * projeto já usa). A decisão "envia ou não" acontece antes de enfileirar e fica
 * registrada em NotificationDelivery; o worker só entrega o que foi permitido.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private queue!: Queue<DeliveryJob>;
  private worker?: Worker<DeliveryJob>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  onModuleInit() {
    const connection = redisConnection(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
    this.queue = new Queue<DeliveryJob>(NOTIFICATIONS_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
    // NOTIFICATIONS_WORKER=0 permite rodar o worker em outro processo no futuro.
    if (this.config.get('NOTIFICATIONS_WORKER', '1') !== '0') {
      this.worker = new Worker<DeliveryJob>(
        NOTIFICATIONS_QUEUE,
        (job) => this.deliver(job),
        { connection, concurrency: 5 },
      );
      this.worker.on('failed', (job, err) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
          void this.prisma.notificationDelivery
            .update({
              where: { id: job.data.deliveryId },
              data: { status: 'FAILED', detail: err.message.slice(0, 300) },
            })
            .catch(() => undefined);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async getPreferences(userId: string): Promise<Preferences> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!row) return { ...DEFAULT_PREFERENCES };
    return {
      emailEnabled: row.emailEnabled,
      pushEnabled: row.pushEnabled,
      smsEnabled: row.smsEnabled,
      promotionsEnabled: row.promotionsEnabled,
      ordersEnabled: row.ordersEnabled,
    };
  }

  /** Atualiza somente os campos enviados; os demais mantêm o valor salvo. */
  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<Preferences> {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => typeof v === 'boolean'),
    ) as Partial<Preferences>;
    if (!Object.keys(changes).length) {
      throw new BadRequestException('Informe ao menos uma preferência');
    }
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCES, ...changes },
      update: changes,
    });
    return this.getPreferences(userId);
  }

  /** Canais com provedor configurado neste ambiente (para a tela avisar o usuário). */
  channelStatus() {
    return {
      email: this.mail.isConfigured ? 'configured' : 'dev_log',
      sms: this.sms.isConfigured ? 'configured' : 'dev_log',
      push: 'not_configured',
    };
  }

  async dispatch(
    userId: string,
    category: NotificationCategory,
    message: OutgoingMessage,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) return [];
    const prefs = await this.getPreferences(userId);
    const html =
      message.html ??
      this.mail.genericHtml(user.name, message.title, message.text);

    const results: Array<{ channel: NotificationChannel; status: string }> = [];
    for (const channel of ALL_CHANNELS) {
      if (!isAllowed(prefs, category, channel)) {
        await this.record(
          userId,
          category,
          channel,
          'SKIPPED_PREFERENCE',
          message.title,
        );
        results.push({ channel, status: 'SKIPPED_PREFERENCE' });
        continue;
      }
      if (channel === 'PUSH') {
        // Push depende do Firebase Cloud Messaging (US23, sprint futura).
        await this.record(
          userId,
          category,
          channel,
          'SKIPPED_UNAVAILABLE',
          message.title,
          'Push (FCM) ainda não integrado — US23',
        );
        results.push({ channel, status: 'SKIPPED_UNAVAILABLE' });
        continue;
      }
      const delivery = await this.record(
        userId,
        category,
        channel,
        'QUEUED',
        message.title,
      );
      await this.queue.add(channel, {
        deliveryId: delivery.id,
        text: message.text,
        html,
      });
      results.push({ channel, status: 'QUEUED' });
    }
    return results;
  }

  /** Disparo de campanha promocional para todas as contas ativas (ADMIN). */
  async broadcastPromotion(title: string, text: string) {
    let cursor: string | undefined;
    let users = 0;
    for (;;) {
      const batch = await this.prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 200,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (!batch.length) break;
      for (const u of batch) {
        await this.dispatch(u.id, 'PROMOTIONS', { title, text });
      }
      users += batch.length;
      cursor = batch[batch.length - 1].id;
    }
    return { users };
  }

  private record(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel,
    status: 'QUEUED' | 'SKIPPED_PREFERENCE' | 'SKIPPED_UNAVAILABLE',
    title: string,
    detail?: string,
  ) {
    return this.prisma.notificationDelivery.create({
      data: { userId, category, channel, status, title, detail },
    });
  }

  /** Worker: entrega um item da fila e atualiza o status. */
  private async deliver(job: Job<DeliveryJob>) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { user: true },
    });
    if (!delivery || delivery.status !== 'QUEUED') return;
    const { user } = delivery;
    if (user.deletedAt) {
      await this.setStatus(
        delivery.id,
        'SKIPPED_UNAVAILABLE',
        'Conta excluída',
      );
      return;
    }
    // Reconfere a preferência na hora do envio: se o usuário desligou o canal
    // enquanto a mensagem esperava na fila, ela não sai.
    const prefs = await this.getPreferences(user.id);
    if (!isAllowed(prefs, delivery.category, delivery.channel)) {
      await this.setStatus(
        delivery.id,
        'SKIPPED_PREFERENCE',
        'Preferência alterada antes do envio',
      );
      return;
    }

    if (delivery.channel === 'EMAIL') {
      await this.mail.send(user.email, delivery.title, job.data.html);
      await this.setStatus(
        delivery.id,
        this.mail.isConfigured ? 'SENT' : 'DEV_LOGGED',
      );
      return;
    }
    if (delivery.channel === 'SMS') {
      if (!user.phone) {
        await this.setStatus(
          delivery.id,
          'SKIPPED_UNAVAILABLE',
          'Usuário sem telefone cadastrado',
        );
        return;
      }
      await this.sms.sendText(
        user.phone,
        `FastSell: ${job.data.text}`.slice(0, 300),
      );
      await this.setStatus(
        delivery.id,
        this.sms.isConfigured ? 'SENT' : 'DEV_LOGGED',
      );
    }
  }

  private async setStatus(
    id: string,
    status:
      'SENT' | 'DEV_LOGGED' | 'SKIPPED_PREFERENCE' | 'SKIPPED_UNAVAILABLE',
    detail?: string,
  ) {
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status, detail },
    });
    this.logger.debug(`delivery ${id} -> ${status}`);
  }
}
