import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';

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

  async send(to: string, subject: string, html: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM', 'FastSell <noreply@fastsell.local>');

    if (!this.transporter) {
      this.logger.log(`[DEV MAIL] to=${to} subject=${subject}\n${html}`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject, html });
  }

  passwordResetHtml(name: string | null, resetUrl: string): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2>Redefinição de senha — FastSell</h2>
        <p>Olá${name ? ` ${name}` : ''},</p>
        <p>Recebemos uma solicitação para redefinir sua senha. O link expira em <strong>24 horas</strong>.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="background:#1a73e8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
            Redefinir senha
          </a>
        </p>
        <p>Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `;
  }

  lockoutAlertHtml(name: string | null, minutes: number): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2>Alerta de segurança — FastSell</h2>
        <p>Olá${name ? ` ${name}` : ''},</p>
        <p>Detectamos várias tentativas de login falhas na sua conta.</p>
        <p>Por proteção, o acesso foi bloqueado temporariamente por <strong>${minutes} minutos</strong>.</p>
        <p>Se não foi você, redefina sua senha assim que o bloqueio terminar.</p>
      </div>
    `;
  }
}
