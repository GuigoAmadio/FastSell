import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toE164 } from '../common/validators';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      this.config.get<string>('TWILIO_AUTH_TOKEN') &&
      this.config.get<string>('TWILIO_FROM_NUMBER'),
    );
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.sendText(
      phone,
      `Seu código FastSell é ${code}. Válido por 5 minutos.`,
      `code=${code}`,
    );
  }

  /** Envia SMS via Twilio. Sem credenciais, só registra no log (modo dev). */
  async sendText(phone: string, text: string, devLog?: string): Promise<void> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM_NUMBER');
    // Telefones são salvos só com dígitos (US06); a Twilio exige E.164.
    const to = toE164(phone);

    if (!sid || !token || !from) {
      this.logger.log(`[DEV SMS] to=${to} ${devLog ?? `text=${text}`}`);
      return;
    }

    const body = new URLSearchParams({ To: to, From: from, Body: text });

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Twilio error: ${text}`);
      throw new Error('Falha ao enviar SMS');
    }
  }
}
