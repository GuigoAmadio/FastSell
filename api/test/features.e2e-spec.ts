import { authenticator } from 'otplib';
import {
  createAdmin,
  createTestApp,
  destroyTestApp,
  expectOk,
  registerAndLogin,
  strongPassword,
  TestContext,
  uniqueEmail,
  waitForAudit,
} from './helpers';

describe('FastSell features (HTTP real + DB + AuditLog)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  describe('US01 US03 US04 - registro, login, reset, lockout', () => {
    it('registra usuario, grava no banco e gera AuditLog INSERT em User', async () => {
      const since = new Date();
      const email = uniqueEmail('reg');
      const res = await ctx.http().post('/auth/register').send({
        email,
        password: strongPassword,
        name: 'Cliente Novo',
      });

      expectOk(res.status);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(email);

      const dbUser = await ctx.prisma.user.findUnique({ where: { email } });
      expect(dbUser).not.toBeNull();
      expect(dbUser!.name).toBe('Cliente Novo');
      expect(dbUser!.passwordHash).toBeTruthy();
      expect(dbUser!.passwordHash).not.toContain(strongPassword);

      const audit = await waitForAudit(ctx.prisma, {
        tableName: 'User',
        operation: 'INSERT',
        rowId: dbUser!.id,
        since,
      });
      expect(audit.newData).toMatchObject({ email });
      expect((audit.newData as any).passwordHash).toBe('[REDACTED]');
    });

    it('login com senha correta cria LoginAttempt success e RefreshToken', async () => {
      const session = await registerAndLogin(ctx, { name: 'Login OK' });
      const since = new Date();

      const login = await ctx.http().post('/auth/login').send({
        email: session.email,
        password: strongPassword,
      });
      expectOk(login.status);
      expect(login.body.accessToken).toBeDefined();

      const attempts = await ctx.prisma.loginAttempt.findMany({
        where: { email: session.email, success: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(attempts).toHaveLength(1);

      const tokens = await ctx.prisma.refreshToken.findMany({
        where: { userId: session.user.id, revokedAt: null },
      });
      expect(tokens.length).toBeGreaterThan(0);

      await waitForAudit(ctx.prisma, {
        tableName: 'LoginAttempt',
        operation: 'INSERT',
        since,
      });
    });

    it('bloqueia apos 5 falhas e registra auditoria + LoginAttempt', async () => {
      const session = await registerAndLogin(ctx);
      await ctx.redis.del(
        `login:lock:${session.user.id}`,
        `login:fail:${session.user.id}`,
      );

      const since = new Date();
      for (let i = 0; i < 5; i++) {
        const fail = await ctx.http().post('/auth/login').send({
          email: session.email,
          password: 'SenhaErrada@1',
        });
        expect(fail.status).toBe(401);
      }

      const locked = await ctx.http().post('/auth/login').send({
        email: session.email,
        password: strongPassword,
      });
      expect(locked.status).toBe(403);
      const remaining =
        locked.body.message?.lockRemainingSeconds ??
        locked.body.lockRemainingSeconds;
      expect(remaining).toBeGreaterThan(0);

      const fails = await ctx.prisma.loginAttempt.count({
        where: { email: session.email, success: false },
      });
      expect(fails).toBeGreaterThanOrEqual(5);

      await waitForAudit(ctx.prisma, {
        tableName: 'LoginAttempt',
        operation: 'INSERT',
        since,
      });

      await ctx.redis.del(
        `login:lock:${session.user.id}`,
        `login:fail:${session.user.id}`,
      );
    });

    it('reset de senha: forgot -> token -> reset -> confere no banco', async () => {
      const session = await registerAndLogin(ctx);
      const since = new Date();

      const forgot = await ctx.http().post('/auth/forgot-password').send({
        email: session.email,
      });
      expectOk(forgot.status);
      expect(forgot.body.resetToken).toBeDefined();

      const resetRow = await ctx.prisma.passwordResetToken.findFirst({
        where: { userId: session.user.id, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(resetRow).not.toBeNull();

      await waitForAudit(ctx.prisma, {
        tableName: 'PasswordResetToken',
        operation: 'INSERT',
        rowId: resetRow!.id,
        since,
      });

      const newPassword = 'NovaSenha@99';
      const reset = await ctx.http().post('/auth/reset-password').send({
        token: forgot.body.resetToken,
        password: newPassword,
      });
      expectOk(reset.status);

      const used = await ctx.prisma.passwordResetToken.findUnique({
        where: { id: resetRow!.id },
      });
      expect(used!.usedAt).not.toBeNull();

      const loginOld = await ctx.http().post('/auth/login').send({
        email: session.email,
        password: strongPassword,
      });
      expect(loginOld.status).toBe(401);

      const loginNew = await ctx.http().post('/auth/login').send({
        email: session.email,
        password: newPassword,
      });
      expectOk(loginNew.status);
    });
  });

  describe('US02 - 2FA TOTP', () => {
    it('setup -> confirm -> login exige OTP -> verify', async () => {
      const session = await registerAndLogin(ctx);
      const since = new Date();

      const setup = await ctx
        .http()
        .post('/auth/2fa/setup')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ method: 'TOTP' });
      expectOk(setup.status);
      expect(setup.body.secret).toBeDefined();
      expect(setup.body.qrCodeDataUrl).toMatch(/^data:image/);

      const code = authenticator.generate(setup.body.secret);
      const confirm = await ctx
        .http()
        .post('/auth/2fa/confirm')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ code });
      expectOk(confirm.status);
      expect(confirm.body.user.twoFactorEnabled).toBe(true);

      const dbUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
      });
      expect(dbUser.twoFactorEnabled).toBe(true);
      expect(dbUser.totpSecret).toBe(setup.body.secret);

      await waitForAudit(ctx.prisma, {
        tableName: 'User',
        operation: 'UPDATE',
        rowId: session.user.id,
        since,
      });

      const login = await ctx.http().post('/auth/login').send({
        email: session.email,
        password: strongPassword,
      });
      expectOk(login.status);
      expect(login.body.requires2fa).toBe(true);
      expect(login.body.challengeId).toBeDefined();

      const otp = authenticator.generate(setup.body.secret);
      const verify = await ctx.http().post('/auth/2fa/verify').send({
        challengeId: login.body.challengeId,
        code: otp,
      });
      expectOk(verify.status);
      expect(verify.body.accessToken).toBeDefined();
    });
  });

  describe('US05 - sessoes', () => {
    it('lista sessoes e revoga uma, conferindo revokedAt no banco', async () => {
      const session = await registerAndLogin(ctx);
      await ctx.http().post('/auth/login').send({
        email: session.email,
        password: strongPassword,
      });

      const list = await ctx
        .http()
        .get('/me/sessions')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('x-refresh-token', session.refreshToken);
      expectOk(list.status);
      const sessions = list.body.sessions ?? list.body;
      expect(sessions.length).toBeGreaterThanOrEqual(1);

      const other =
        (sessions as any[]).find((s) => !s.isCurrent) ?? sessions[0];
      const since = new Date();
      const rev = await ctx
        .http()
        .delete(`/me/sessions/${other.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`);
      expectOk(rev.status);

      const row = await ctx.prisma.refreshToken.findUnique({
        where: { id: other.id },
      });
      expect(row!.revokedAt).not.toBeNull();

      await waitForAudit(ctx.prisma, {
        tableName: 'RefreshToken',
        operation: 'UPDATE',
        rowId: other.id,
        since,
      });
    });
  });

  describe('US06 - perfil', () => {
    it('atualiza nome/telefone/cpf e gera AuditLog UPDATE', async () => {
      const session = await registerAndLogin(ctx);
      const since = new Date();

      const patch = await ctx
        .http()
        .patch('/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          name: 'Nome Atualizado',
          phone: '11987654321',
          cpf: '52998224725',
        });
      expectOk(patch.status);
      expect(patch.body.user.name).toBe('Nome Atualizado');
      expect(patch.body.user.cpf).toBe('52998224725');

      const db = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
      });
      expect(db.name).toBe('Nome Atualizado');
      expect(db.phone).toBe('11987654321');
      expect(db.cpf).toBe('52998224725');

      const audit = await waitForAudit(ctx.prisma, {
        tableName: 'User',
        operation: 'UPDATE',
        rowId: session.user.id,
        since,
      });
      expect((audit.newData as any).name).toBe('Nome Atualizado');
    });
  });

  describe('US07 - enderecos', () => {
    it('cria endereco, setDefault e delete com auditoria', async () => {
      const session = await registerAndLogin(ctx);
      const auth = { Authorization: `Bearer ${session.accessToken}` };
      const since = new Date();

      const a1 = await ctx.http().post('/me/addresses').set(auth).send({
        label: 'Casa',
        cep: '01310100',
        street: 'Av Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'Sao Paulo',
        state: 'SP',
        isDefault: true,
      });
      expectOk(a1.status);
      expect(a1.body.isDefault).toBe(true);

      const db1 = await ctx.prisma.address.findUnique({
        where: { id: a1.body.id },
      });
      expect(db1).not.toBeNull();

      await waitForAudit(ctx.prisma, {
        tableName: 'Address',
        operation: 'INSERT',
        rowId: a1.body.id,
        since,
      });

      const a2 = await ctx.http().post('/me/addresses').set(auth).send({
        label: 'Trabalho',
        cep: '22041080',
        street: 'Rua Visconde de Piraja',
        number: '50',
        neighborhood: 'Ipanema',
        city: 'Rio de Janeiro',
        state: 'RJ',
      });
      expectOk(a2.status);

      const setDef = await ctx
        .http()
        .post(`/me/addresses/${a2.body.id}/default`)
        .set(auth);
      expectOk(setDef.status);

      const after = await ctx.prisma.address.findMany({
        where: { userId: session.user.id },
      });
      expect(after.find((a) => a.id === a2.body.id)!.isDefault).toBe(true);
      expect(after.find((a) => a.id === a1.body.id)!.isDefault).toBe(false);

      const delSince = new Date();
      const del = await ctx
        .http()
        .delete(`/me/addresses/${a1.body.id}`)
        .set(auth);
      expectOk(del.status);
      expect(
        await ctx.prisma.address.findUnique({ where: { id: a1.body.id } }),
      ).toBeNull();

      await waitForAudit(ctx.prisma, {
        tableName: 'Address',
        operation: 'DELETE',
        rowId: a1.body.id,
        since: delSince,
      });
    });
  });

  describe('Auditoria - API de consulta', () => {
    it('GET /audit exige ADMIN (dados pessoais na auditoria)', async () => {
      const session = await registerAndLogin(ctx);
      const res = await ctx
        .http()
        .get('/audit?limit=5')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /audit e /audit/stats retornam dados apos mutacoes', async () => {
      const session = await createAdmin(ctx);
      const res = await ctx
        .http()
        .get('/audit?limit=20')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expectOk(res.status);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const stats = await ctx
        .http()
        .get('/audit/stats')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expectOk(stats.status);
      expect(stats.body.some((s: any) => s.tableName === 'User')).toBe(true);
    });
  });
});
