import { NotificationCategory, NotificationChannel } from '@prisma/client';

export type Preferences = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  promotionsEnabled: boolean;
  ordersEnabled: boolean;
};

/**
 * Padrões para quem nunca abriu a tela: avisos de pedido por e-mail e push;
 * promoções desligadas (marketing só com opt-in) e SMS desligado.
 */
export const DEFAULT_PREFERENCES: Preferences = {
  emailEnabled: true,
  pushEnabled: true,
  smsEnabled: false,
  promotionsEnabled: false,
  ordersEnabled: true,
};

export const ALL_CHANNELS: NotificationChannel[] = ['EMAIL', 'PUSH', 'SMS'];

/**
 * US08 — regra de envio condicional. Canal e categoria são independentes:
 * uma mensagem sai por um canal só se o canal E a categoria estiverem ligados.
 * Alertas de segurança (bloqueio, redefinição de senha, exclusão de conta) não
 * passam por aqui: são transacionais e sempre vão por e-mail.
 */
export function isAllowed(
  prefs: Preferences,
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  const categoryOn =
    category === 'ORDERS' ? prefs.ordersEnabled : prefs.promotionsEnabled;
  const channelOn =
    channel === 'EMAIL'
      ? prefs.emailEnabled
      : channel === 'PUSH'
        ? prefs.pushEnabled
        : prefs.smsEnabled;
  return categoryOn && channelOn;
}
