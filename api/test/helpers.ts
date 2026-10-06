import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

export type TestContext = {
  app: INestApplication;
  prisma: PrismaClient;
  redis: Redis;
  http: () => ReturnType<typeof request>;
};

export async function createTestApp(): Promise<TestContext> {
  process.env.NODE_ENV = 'test';
  process.env.EXPOSE_DEV_TOKENS = '1';
  process.env.LOGIN_MAX_ATTEMPTS = process.env.LOGIN_MAX_ATTEMPTS || '5';
  process.env.LOGIN_LOCKOUT_SECONDS = process.env.LOGIN_LOCKOUT_SECONDS || '60';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  return {
    app,
    prisma,
    redis,
    http: () => request(app.getHttpServer()),
  };
}

export async function destroyTestApp(ctx: TestContext) {
  await ctx.app.close();
  await ctx.prisma.$disconnect();
  await ctx.redis.quit();
}

export function uniqueEmail(prefix = 'test') {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@fastsell.test`;
}

export function expectOk(status: number) {
  expect([200, 201]).toContain(status);
}

export const strongPassword = 'Senha@123';

export async function registerAndLogin(
  ctx: TestContext,
  overrides?: { email?: string; password?: string; name?: string },
) {
  const email = overrides?.email ?? uniqueEmail();
  const password = overrides?.password ?? strongPassword;
  const register = await ctx.http().post('/auth/register').send({
    email,
    password,
    name: overrides?.name ?? 'Tester',
  });
      expectOk(register.status);
  return {
    email,
    password,
    accessToken: register.body.accessToken as string,
    refreshToken: register.body.refreshToken as string,
    user: register.body.user as { id: string; email: string },
  };
}

export async function waitForAudit(
  prisma: PrismaClient,
  opts: {
    tableName: string;
    operation?: string;
    rowId?: string;
    since: Date;
    timeoutMs?: number;
  },
) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const started = Date.now();
  const since = new Date(opts.since.getTime() - 2000);
  while (Date.now() - started < timeoutMs) {
    const hit = await prisma.auditLog.findFirst({
      where: {
        tableName: opts.tableName,
        ...(opts.operation ? { operation: opts.operation } : {}),
        ...(opts.rowId ? { rowId: opts.rowId } : {}),
        changedAt: { gte: since },
      },
      orderBy: { changedAt: 'desc' },
    });
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(
    `AuditLog nao encontrado: ${opts.tableName} ${opts.operation ?? ''} ${opts.rowId ?? ''}`,
  );
}
