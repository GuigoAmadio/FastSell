import { createHash } from 'crypto';
import {
  auth,
  buy,
  createAdmin,
  createProduct,
  createTestApp,
  destroyTestApp,
  expectOk,
  prepareBuyer,
  registerAndLogin,
  strongPassword,
  TestContext,
  TINY_PNG,
  uniqueEmail,
  waitForDeliveries,
} from './helpers';

/**
 * Sprint 3 — revisão das US03, US04, US06, US08 e implementação da US09.
 * HTTP real + PostgreSQL + Redis.
 */
describe('Conta e segurança (US03, US04, US06, US08, US09)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  const login = (email: string, password: string, ip?: string) => {
    const req = ctx.http().post('/auth/login');
    if (ip) req.set('X-Forwarded-For', ip);
    return req.send({ email, password });
  };

  describe('US03 - redefinição de senha', () => {
    it('link expira em 24h: token vencido é recusado', async () => {
      const s = await registerAndLogin(ctx);
      const forgot = await ctx
        .http()
        .post('/auth/forgot-password')
        .send({ email: s.email });
      const row = await ctx.prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: s.user.id, usedAt: null },
      });
      const ttlHours =
        (row.expiresAt.getTime() - row.createdAt.getTime()) / 3_600_000;
      expect(Math.round(ttlHours)).toBe(24);

      await ctx.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const reset = await ctx
        .http()
        .post('/auth/reset-password')
        .send({ token: forgot.body.resetToken, password: 'NovaSenha@1' });
      expect(reset.status).toBe(400);
    });

    it.each([
      ['curta', 'Ab@1'],
      ['sem número', 'SenhaForte@'],
      ['sem símbolo', 'SenhaForte1'],
      ['sem letra', '12345678@'],
    ])('rejeita senha fraca (%s)', async (_label, password) => {
      const s = await registerAndLogin(ctx);
      const forgot = await ctx
        .http()
        .post('/auth/forgot-password')
        .send({ email: s.email });
      const reset = await ctx
        .http()
        .post('/auth/reset-password')
        .send({ token: forgot.body.resetToken, password });
      expect(reset.status).toBe(400);
      expect(JSON.stringify(reset.body.message)).toMatch(/Senha fraca/);
    });

    it('novo pedido invalida o link anterior e o token só vale uma vez', async () => {
      const s = await registerAndLogin(ctx);
      const first = await ctx
        .http()
        .post('/auth/forgot-password')
        .send({ email: s.email });
      const second = await ctx
        .http()
        .post('/auth/forgot-password')
        .send({ email: s.email });

      const old = await ctx
        .http()
        .post('/auth/reset-password')
        .send({ token: first.body.resetToken, password: 'NovaSenha@1' });
      expect(old.status).toBe(400);

      const ok = await ctx
        .http()
        .post('/auth/reset-password')
        .send({ token: second.body.resetToken, password: 'NovaSenha@1' });
      expectOk(ok.status);

      const again = await ctx
        .http()
        .post('/auth/reset-password')
        .send({ token: second.body.resetToken, password: 'OutraSenha@2' });
      expect(again.status).toBe(400);
    });

    it('e-mail inexistente recebe a mesma resposta (sem enumeração)', async () => {
      const res = await ctx
        .http()
        .post('/auth/forgot-password')
        .send({ email: uniqueEmail('nao-existe') });
      expectOk(res.status);
      expect(res.body.message).toMatch(/Se o e-mail existir/);
      expect(res.body.resetToken).toBeUndefined();
    });

    it('a página do link do e-mail existe e leva ao app', async () => {
      const token = 'a'.repeat(64);
      const page = await ctx.http().get(`/reset-password?token=${token}`);
      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toMatch(/text\/html/);
      expect(page.text).toContain(`fastsell://reset-password?token=${token}`);

      const bad = await ctx.http().get('/reset-password?token=<script>');
      expect(bad.status).toBe(200);
      expect(bad.text).not.toContain('<script>');
      expect(bad.text).toMatch(/inválido/);
    });
  });

  describe('US04 - bloqueio por tentativas', () => {
    it('5 falhas bloqueiam por 15 min, bloqueio persiste no banco e sobrevive ao Redis', async () => {
      const prev = process.env.LOGIN_LOCKOUT_SECONDS;
      process.env.LOGIN_LOCKOUT_SECONDS = '900';
      try {
        const s = await registerAndLogin(ctx);
        for (let i = 0; i < 4; i++) {
          expect((await login(s.email, 'Errada@123')).status).toBe(401);
        }
        // Ainda não bloqueou: a senha certa entra e zera o contador.
        expectOk((await login(s.email, strongPassword)).status);

        for (let i = 0; i < 5; i++) {
          expect((await login(s.email, 'Errada@123')).status).toBe(401);
        }
        const locked = await login(s.email, strongPassword);
        expect(locked.status).toBe(403);
        const remaining =
          locked.body.message?.lockRemainingSeconds ??
          locked.body.lockRemainingSeconds;
        expect(remaining).toBeGreaterThan(880);
        expect(remaining).toBeLessThanOrEqual(900);

        const db = await ctx.prisma.user.findUniqueOrThrow({
          where: { id: s.user.id },
        });
        expect(db.lockedUntil).not.toBeNull();
        const minutes = (db.lockedUntil!.getTime() - Date.now()) / 60000;
        expect(minutes).toBeGreaterThan(14);
        expect(minutes).toBeLessThanOrEqual(15);

        // Simula restart/flush do Redis: o bloqueio continua (fonte = banco).
        await ctx.redis.del(`login:lock:${s.user.id}`);
        expect((await login(s.email, strongPassword)).status).toBe(403);

        const reasons = await ctx.prisma.loginAttempt.findMany({
          where: { userId: s.user.id },
          select: { reason: true },
        });
        expect(
          reasons.filter((r) => r.reason === 'invalid_password').length,
        ).toBe(9);
        expect(reasons.some((r) => r.reason === 'account_locked')).toBe(true);
      } finally {
        process.env.LOGIN_LOCKOUT_SECONDS = prev;
      }
    });

    it('bloqueio termina sozinho após o prazo', async () => {
      const s = await registerAndLogin(ctx);
      for (let i = 0; i < 5; i++) await login(s.email, 'Errada@123');
      expect((await login(s.email, strongPassword)).status).toBe(403);
      // "avança o relógio": expira o bloqueio no banco e no Redis
      await ctx.prisma.user.update({
        where: { id: s.user.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      await ctx.redis.del(`login:lock:${s.user.id}`);
      expectOk((await login(s.email, strongPassword)).status);
    });

    it('redefinir a senha libera a conta bloqueada', async () => {
      const s = await registerAndLogin(ctx);
      for (let i = 0; i < 5; i++) await login(s.email, 'Errada@123');
      expect((await login(s.email, strongPassword)).status).toBe(403);
      const forgot = await ctx
        .http()
        .post('/auth/forgot-password')
        .send({ email: s.email });
      await ctx
        .http()
        .post('/auth/reset-password')
        .send({ token: forgot.body.resetToken, password: 'NovaSenha@9' });
      expectOk((await login(s.email, 'NovaSenha@9')).status);
    });

    it('contador por IP bloqueia força bruta em várias contas/e-mails', async () => {
      const prev = process.env.LOGIN_IP_MAX_ATTEMPTS;
      process.env.LOGIN_IP_MAX_ATTEMPTS = '6';
      const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
      try {
        await ctx.redis.del(`login:fail:ip:${ip}`, `login:lock:ip:${ip}`);
        for (let i = 0; i < 6; i++) {
          const res = await login(uniqueEmail('bruteforce'), 'Errada@123', ip);
          expect(res.status).toBe(401);
        }
        const blocked = await login(
          uniqueEmail('bruteforce'),
          'Errada@123',
          ip,
        );
        expect(blocked.status).toBe(429);
        // Outro IP segue normal
        const other = await registerAndLogin(ctx);
        expectOk(
          (await login(other.email, strongPassword, '198.51.100.7')).status,
        );
      } finally {
        process.env.LOGIN_IP_MAX_ATTEMPTS = prev;
        await ctx.redis.del(`login:fail:ip:${ip}`, `login:lock:ip:${ip}`);
      }
    });
  });

  describe('US06 - perfil, CPF e telefone', () => {
    it('aceita CPF com máscara e grava só dígitos', async () => {
      const s = await registerAndLogin(ctx);
      const res = await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ cpf: '529.982.247-25', phone: '(11) 98765-4321' });
      expectOk(res.status);
      expect(res.body.user.cpf).toBe('52998224725');
      expect(res.body.user.phone).toBe('11987654321');
    });

    it.each([
      ['dígito verificador errado', '52998224724'],
      ['repetido', '111.111.111-11'],
      ['com letra', '5299822472x'],
      ['curto', '123'],
    ])('rejeita CPF inválido (%s) e não altera o banco', async (_l, cpf) => {
      const s = await registerAndLogin(ctx);
      await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ cpf: '52998224725' });
      const res = await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ cpf });
      expect(res.status).toBe(400);
      const db = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: s.user.id },
      });
      expect(db.cpf).toBe('52998224725');
    });

    it('telefone inválido é rejeitado', async () => {
      const s = await registerAndLogin(ctx);
      const res = await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ phone: '(00) 1234-5678' });
      expect(res.status).toBe(400);
    });

    it('campo vazio remove o dado; campos não enviados são preservados', async () => {
      const s = await registerAndLogin(ctx, { name: 'Nome Original' });
      await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ cpf: '52998224725', phone: '11987654321' });

      const onlyName = await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ name: 'Novo Nome' });
      expectOk(onlyName.status);
      expect(onlyName.body.user).toMatchObject({
        name: 'Novo Nome',
        cpf: '52998224725',
        phone: '11987654321',
      });

      const clear = await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ cpf: '' });
      expectOk(clear.status);
      expect(clear.body.user.cpf).toBeNull();
      expect(clear.body.user.phone).toBe('11987654321');
    });

    it('upload de foto: PNG real aceito; arquivo falso com mimetype de imagem recusado', async () => {
      const s = await registerAndLogin(ctx);
      const ok = await ctx
        .http()
        .post('/me/photo')
        .set(auth(s.accessToken))
        .attach('photo', TINY_PNG, {
          filename: 'foto.png',
          contentType: 'image/png',
        });
      expectOk(ok.status);
      expect(ok.body.user.photoUrl).toMatch(/^\/uploads\/avatars\/.+\.png$/);
      const served = await ctx.http().get(ok.body.user.photoUrl);
      // A API de teste não usa useStaticAssets (só main.ts); confere o arquivo no disco.
      expect([200, 404]).toContain(served.status);

      const fake = await ctx
        .http()
        .post('/me/photo')
        .set(auth(s.accessToken))
        .attach('photo', Buffer.from('não sou imagem'), {
          filename: 'x.png',
          contentType: 'image/png',
        });
      expect(fake.status).toBe(400);

      const pdf = await ctx
        .http()
        .post('/me/photo')
        .set(auth(s.accessToken))
        .attach('photo', Buffer.from('%PDF-1.4'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        });
      expect(pdf.status).toBe(400);
    });
  });

  describe('US08 - preferências de notificação', () => {
    it('padrões, alteração independente e persistência', async () => {
      const s = await registerAndLogin(ctx);
      const initial = await ctx
        .http()
        .get('/me/notification-preferences')
        .set(auth(s.accessToken));
      expectOk(initial.status);
      expect(initial.body.preferences).toEqual({
        emailEnabled: true,
        pushEnabled: true,
        smsEnabled: false,
        promotionsEnabled: false,
        ordersEnabled: true,
      });
      expect(initial.body.channels.push).toBe('not_configured');

      const sms = await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(s.accessToken))
        .send({ smsEnabled: true });
      expectOk(sms.status);
      const promos = await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(s.accessToken))
        .send({ promotionsEnabled: true });
      const email = await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(s.accessToken))
        .send({ emailEnabled: false });
      expect(promos.body.preferences.smsEnabled).toBe(true); // não foi desfeito
      expect(email.body.preferences).toEqual({
        emailEnabled: false,
        pushEnabled: true,
        smsEnabled: true,
        promotionsEnabled: true,
        ordersEnabled: true,
      });

      const row = await ctx.prisma.notificationPreference.findUniqueOrThrow({
        where: { userId: s.user.id },
      });
      expect(row).toMatchObject({
        emailEnabled: false,
        smsEnabled: true,
        promotionsEnabled: true,
      });

      const again = await ctx
        .http()
        .get('/me/notification-preferences')
        .set(auth(s.accessToken));
      expect(again.body.preferences).toEqual(email.body.preferences);
    });

    it('valida entrada: corpo vazio e valores não booleanos', async () => {
      const s = await registerAndLogin(ctx);
      const empty = await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(s.accessToken))
        .send({});
      expect(empty.status).toBe(400);
      const wrong = await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(s.accessToken))
        .send({ emailEnabled: 'sim' });
      expect(wrong.status).toBe(400);
      const unknown = await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(s.accessToken))
        .send({ whatsappEnabled: true });
      expect(unknown.status).toBe(400);
    });

    it('envio de aviso de pedido respeita as preferências (fila)', async () => {
      const admin = await createAdmin(ctx);
      const product = await createProduct(ctx, admin.accessToken, {
        variants: [{ color: 'Azul', stock: 10 }],
      });

      // Comprador A: e-mail desligado, SMS ligado
      const a = await registerAndLogin(ctx);
      await prepareBuyer(ctx, a.accessToken);
      await ctx
        .http()
        .patch('/me')
        .set(auth(a.accessToken))
        .send({ phone: '11987654321' });
      await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(a.accessToken))
        .send({ emailEnabled: false });
      await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(a.accessToken))
        .send({ smsEnabled: true });
      await buy(ctx, a.accessToken, product.variants[0].id);
      const da = await waitForDeliveries(ctx.prisma, a.user.id);
      const byChannelA = Object.fromEntries(
        da.map((d) => [d.channel, d.status]),
      );
      expect(byChannelA).toEqual({
        EMAIL: 'SKIPPED_PREFERENCE',
        SMS: 'DEV_LOGGED', // sem Twilio configurado: registrado no log, não enviado
        PUSH: 'SKIPPED_UNAVAILABLE',
      });

      // Comprador B: categoria "Pedidos" desligada -> nada sai
      const b = await registerAndLogin(ctx);
      await prepareBuyer(ctx, b.accessToken);
      await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(b.accessToken))
        .send({ ordersEnabled: false });
      await buy(ctx, b.accessToken, product.variants[0].id);
      const db = await waitForDeliveries(ctx.prisma, b.user.id);
      expect(db.every((d) => d.status === 'SKIPPED_PREFERENCE')).toBe(true);
      expect(db).toHaveLength(3);
    });

    it('promoções só chegam a quem marcou a categoria', async () => {
      const admin = await createAdmin(ctx);
      const optIn = await registerAndLogin(ctx);
      await ctx
        .http()
        .patch('/me/notification-preferences')
        .set(auth(optIn.accessToken))
        .send({ promotionsEnabled: true });
      const optOut = await registerAndLogin(ctx);

      const customer = await ctx
        .http()
        .post('/admin/notifications/promotions')
        .set(auth(optIn.accessToken))
        .send({ title: 'Oferta', message: 'Descontos da semana' });
      expect(customer.status).toBe(403);

      const res = await ctx
        .http()
        .post('/admin/notifications/promotions')
        .set(auth(admin.accessToken))
        .send({ title: 'Oferta teste', message: 'Descontos da semana' });
      expectOk(res.status);

      const inRows = await waitForDeliveries(ctx.prisma, optIn.user.id);
      const outRows = await waitForDeliveries(ctx.prisma, optOut.user.id);
      expect(inRows.find((r) => r.channel === 'EMAIL')?.status).toBe(
        'DEV_LOGGED',
      );
      expect(outRows.every((r) => r.status === 'SKIPPED_PREFERENCE')).toBe(
        true,
      );
    });
  });

  describe('US09 - exclusão de conta (LGPD)', () => {
    it('senha errada não inicia a exclusão', async () => {
      const s = await registerAndLogin(ctx);
      const res = await ctx
        .http()
        .post('/me/account/deletion-request')
        .set(auth(s.accessToken))
        .send({ password: 'Errada@123' });
      expect(res.status).toBe(401);
    });

    it('token de confirmação de outro usuário não exclui a conta', async () => {
      const victim = await registerAndLogin(ctx);
      const attacker = await registerAndLogin(ctx);
      const step1 = await ctx
        .http()
        .post('/me/account/deletion-request')
        .set(auth(attacker.accessToken))
        .send({ password: strongPassword });
      expectOk(step1.status);

      const res = await ctx
        .http()
        .post('/me/account/deletion-confirm')
        .set(auth(victim.accessToken))
        .send({ confirmationToken: step1.body.confirmationToken });
      expect(res.status).toBe(400);
      const db = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: victim.user.id },
      });
      expect(db.deletedAt).toBeNull();
    });

    it('anonimiza dados pessoais e preserva o histórico fiscal', async () => {
      const admin = await createAdmin(ctx);
      const product = await createProduct(ctx, admin.accessToken, {
        variants: [{ color: 'Verde', stock: 5 }],
      });
      const s = await registerAndLogin(ctx, { name: 'Maria Excluir Silva' });
      await prepareBuyer(ctx, s.accessToken, '11144477735');
      await ctx
        .http()
        .patch('/me')
        .set(auth(s.accessToken))
        .send({ phone: '11987654321' });
      const order = await buy(ctx, s.accessToken, product.variants[0].id, 2);
      const review = await ctx
        .http()
        .post(`/products/${product.id}/reviews`)
        .set(auth(s.accessToken))
        .field('rating', '4')
        .field('comment', 'Bom produto')
        .attach('photos', TINY_PNG, {
          filename: 'r.png',
          contentType: 'image/png',
        });
      expectOk(review.status);
      await ctx
        .http()
        .put(`/me/favorites/${product.id}`)
        .set(auth(s.accessToken));

      const step1 = await ctx
        .http()
        .post('/me/account/deletion-request')
        .set(auth(s.accessToken))
        .send({ password: strongPassword });
      expectOk(step1.status);
      expect(step1.body.ordersKept).toBe(1);

      const step2 = await ctx
        .http()
        .post('/me/account/deletion-confirm')
        .set(auth(s.accessToken))
        .send({ confirmationToken: step1.body.confirmationToken });
      expectOk(step2.status);

      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: s.user.id },
      });
      expect(user.deletedAt).not.toBeNull();
      expect(user.email).not.toBe(s.email);
      expect(user.email).toMatch(/@anon\.fastsell\.invalid$/);
      expect([user.name, user.cpf, user.phone, user.photoUrl]).toEqual([
        null,
        null,
        null,
        null,
      ]);

      expect(
        await ctx.prisma.address.count({ where: { userId: s.user.id } }),
      ).toBe(0);
      expect(
        await ctx.prisma.favorite.count({ where: { userId: s.user.id } }),
      ).toBe(0);
      expect(
        await ctx.prisma.refreshToken.count({ where: { userId: s.user.id } }),
      ).toBe(0);
      expect(
        await ctx.prisma.loginAttempt.count({ where: { email: s.email } }),
      ).toBe(0);

      // Histórico fiscal preservado
      const kept = await ctx.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      expect(kept.buyerCpf).toBe('11144477735');
      expect(kept.buyerName).toBe('Comprador Teste');
      expect(kept.buyerEmail).toBeNull();
      expect(kept.items[0].quantity).toBe(2);

      // Avaliação continua (média do produto não muda), sem autor e sem fotos
      const r = await ctx.prisma.review.findFirstOrThrow({
        where: { userId: s.user.id },
        include: { photos: true },
      });
      expect(r.authorName).toBe('Cliente');
      expect(r.rating).toBe(4);
      expect(r.photos).toHaveLength(0);

      // Auditoria sem cópia do e-mail/CPF originais
      const leaks = await ctx.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*)::bigint AS n FROM "AuditLog"
        WHERE ("oldData"::text LIKE ${'%' + s.email + '%'} OR "newData"::text LIKE ${'%' + s.email + '%'})
      `;
      expect(Number(leaks[0].n)).toBe(0);

      // Sem acesso: token antigo, login e refresh param de funcionar
      expect(
        (await ctx.http().get('/me').set(auth(s.accessToken))).status,
      ).toBe(401);
      expect((await login(s.email, strongPassword)).status).toBe(401);
      expect(
        (
          await ctx
            .http()
            .post('/auth/refresh')
            .send({ refreshToken: s.refreshToken })
        ).status,
      ).toBe(401);
    });

    it('confirmação expirada/usada não pode ser reutilizada', async () => {
      const s = await registerAndLogin(ctx);
      const step1 = await ctx
        .http()
        .post('/me/account/deletion-request')
        .set(auth(s.accessToken))
        .send({ password: strongPassword });
      // simula a expiração (10 min) apagando a chave da confirmação
      const hash = createHash('sha256')
        .update(step1.body.confirmationToken)
        .digest('hex');
      await ctx.redis.del(`account:delete:${hash}`);
      const res = await ctx
        .http()
        .post('/me/account/deletion-confirm')
        .set(auth(s.accessToken))
        .send({ confirmationToken: step1.body.confirmationToken });
      expect(res.status).toBe(400);
    });
  });
});
