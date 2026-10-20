import { Controller, Get, Header, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml } from '../mail/mail.service';

/**
 * US03 — página aberta pelo link do e-mail (FRONTEND_RESET_URL).
 * Antes este endereço não existia na API e o link caía num 404.
 * A página não consome o token: só leva o usuário para a tela de nova senha
 * do app (deep link). Quem valida o token é POST /auth/reset-password.
 */
@Controller()
export class ResetPageController {
  constructor(private readonly config: ConfigService) {}

  @Get('reset-password')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  page(@Query('token') token?: string) {
    const valid = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
    const deepBase = this.config.get<string>(
      'MOBILE_RESET_DEEP_LINK',
      'fastsell://reset-password',
    );
    const deepLink = valid ? `${deepBase}?token=${token}` : '';
    const hours = Number(this.config.get('RESET_TOKEN_TTL_HOURS', 24));
    // Versão web do app (flutter run -d edge --web-port 5050), se configurada.
    const webApp = this.config.get<string>('WEB_APP_URL');
    const webLink =
      valid && webApp
        ? `${webApp.replace(/\/$/, '')}/#/reset-password?token=${token}`
        : '';

    const body = valid
      ? `<p>Toque no botão para criar sua nova senha no app FastSell.</p>
         <p><a class="btn" href="${escapeHtml(deepLink)}">Abrir no app</a></p>
         ${webLink ? `<p><a class="btn" href="${escapeHtml(webLink)}">Abrir no navegador</a></p>` : ''}
         <p class="muted">O link vale por ${hours} horas e só pode ser usado uma vez.</p>`
      : `<p>Este link de redefinição está incompleto ou inválido.</p>
         <p class="muted">Peça um novo link na tela “Esqueci minha senha” do app.</p>`;

    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redefinir senha · FastSell</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;background:#f7f9fc;color:#1f2933;margin:0;padding:48px 16px}
  main{max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e3e8ef}
  h1{font-size:20px;margin:0 0 12px}
  .btn{display:inline-block;background:#1a73e8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none}
  .muted{color:#6b7785;font-size:14px}
</style></head>
<body><main><h1>Redefinir senha</h1>${body}</main></body></html>`;
  }
}
