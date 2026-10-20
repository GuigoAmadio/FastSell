import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBrl(cents: number): string {
  const value = (cents / 100).toFixed(2).replace('.', ',');
  return `R$ ${value.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT', 587)),
        secure: false,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    const from = this.config.get<string>(
      'MAIL_FROM',
      'FastSell <noreply@fastsell.local>',
    );

    if (!this.transporter) {
      this.logger.log(`[DEV MAIL] to=${to} subject=${subject}\n${html}`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject, html });
  }

  /** Moldura comum dos e-mails transacionais. */
  private layout(title: string, body: string): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2933">
        <h2 style="margin:0 0 16px">${escapeHtml(title)}</h2>
        ${body}
        <p style="margin-top:32px;font-size:12px;color:#6b7785">FastSell · mensagem automática, não responda.</p>
      </div>
    `;
  }

  private greeting(name: string | null): string {
    return `<p>Olá${name ? ` ${escapeHtml(name)}` : ''},</p>`;
  }

  passwordResetHtml(name: string | null, resetUrl: string, hours = 24): string {
    const url = escapeHtml(resetUrl);
    return this.layout(
      'Redefinição de senha — FastSell',
      `${this.greeting(name)}
        <p>Recebemos uma solicitação para redefinir sua senha. O link expira em <strong>${hours} horas</strong> e só pode ser usado uma vez.</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#1a73e8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
            Redefinir senha
          </a>
        </p>
        <p style="font-size:13px">Se o botão não funcionar, copie este endereço: <br>${url}</p>
        <p>Se você não solicitou isso, ignore este e-mail: sua senha atual continua valendo.</p>`,
    );
  }

  lockoutAlertHtml(name: string | null, minutes: number): string {
    return this.layout(
      'Alerta de segurança — FastSell',
      `${this.greeting(name)}
        <p>Detectamos várias tentativas de login falhas na sua conta.</p>
        <p>Por proteção, o acesso foi bloqueado temporariamente por <strong>${minutes} minutos</strong>.</p>
        <p>Se não foi você, redefina sua senha pelo app: a redefinição também libera o acesso.</p>`,
    );
  }

  accountDeletedHtml(name: string | null): string {
    return this.layout(
      'Sua conta FastSell foi excluída',
      `${this.greeting(name)}
        <p>Confirmamos a exclusão da sua conta, conforme solicitado.</p>
        <p>Seus dados pessoais foram anonimizados. Mantemos apenas os registros fiscais dos pedidos já realizados, pelo prazo exigido pela legislação tributária, sem uso para nenhuma outra finalidade.</p>
        <p>Se você não fez essa solicitação, entre em contato com o suporte imediatamente.</p>`,
    );
  }

  orderConfirmedHtml(
    name: string | null,
    order: {
      number: number;
      totalCents: number;
      items: Array<{
        productName: string;
        variantLabel: string | null;
        quantity: number;
      }>;
    },
  ): string {
    const items = order.items
      .map(
        (i) =>
          `<li>${i.quantity}× ${escapeHtml(i.productName)}${
            i.variantLabel ? ` (${escapeHtml(i.variantLabel)})` : ''
          }</li>`,
      )
      .join('');
    return this.layout(
      `Pedido #${order.number} confirmado`,
      `${this.greeting(name)}
        <p>Recebemos seu pedido <strong>#${order.number}</strong>.</p>
        <ul>${items}</ul>
        <p>Total: <strong>${formatBrl(order.totalCents)}</strong></p>`,
    );
  }

  genericHtml(name: string | null, title: string, message: string): string {
    return this.layout(
      title,
      `${this.greeting(name)}<p>${escapeHtml(message)}</p>`,
    );
  }
}
