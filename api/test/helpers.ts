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
  // Testes simulam IPs diferentes via X-Forwarded-For; o limite por IP alto evita
  // que a suíte inteira (tudo vindo de 127.0.0.1) bloqueie a si mesma.
  process.env.TRUST_PROXY = '1';
  process.env.LOGIN_IP_MAX_ATTEMPTS =
    process.env.LOGIN_IP_MAX_ATTEMPTS || '1000';
  // Frete sem credencial: os testes e2e validam o comportamento "não configurado".
  process.env.MELHOR_ENVIO_TOKEN = '';

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

/** Cria um usuário e promove a ADMIN direto no banco (equivalente ao seed). */
export async function createAdmin(ctx: TestContext) {
  const session = await registerAndLogin(ctx, { name: 'Admin Teste' });
  await ctx.prisma.user.update({
    where: { id: session.user.id },
    data: { role: 'ADMIN' },
  });
  return session;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

let catalogRefs: { categoryId: string; brandId: string } | null = null;

/** Categoria e marca de teste (criadas pela API de admin, uma vez por execução). */
export async function testCatalogRefs(ctx: TestContext, adminToken: string) {
  if (catalogRefs) return catalogRefs;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const cat = await ctx
    .http()
    .post('/admin/categories')
    .set(auth(adminToken))
    .send({ name: `Categoria Teste ${suffix}` });
  const brand = await ctx
    .http()
    .post('/admin/brands')
    .set(auth(adminToken))
    .send({ name: `Marca Teste ${suffix}` });
  expectOk(cat.status);
  expectOk(brand.status);
  catalogRefs = { categoryId: cat.body.id, brandId: brand.body.id };
  return catalogRefs;
}

export function uniqueSku(prefix = 'T') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Produto criado pela API de admin (US31), com variações e estoque definidos. */
export async function createProduct(
  ctx: TestContext,
  adminToken: string,
  overrides: Partial<{
    name: string;
    priceCents: number;
    categoryId: string;
    brandId: string;
    variants: Array<{
      sku?: string;
      color?: string;
      size?: string;
      stock: number;
    }>;
  }> = {},
) {
  const refs = await testCatalogRefs(ctx, adminToken);
  const res = await ctx
    .http()
    .post('/admin/products')
    .set(auth(adminToken))
    .send({
      name: overrides.name ?? `Produto Teste ${Date.now()}`,
      description: 'Produto criado pela suíte de testes e2e.',
      priceCents: overrides.priceCents ?? 10000,
      categoryId: overrides.categoryId ?? refs.categoryId,
      brandId: overrides.brandId ?? refs.brandId,
      specs: [{ label: 'Material', value: 'Teste' }],
      variants: (
        overrides.variants ?? [{ color: 'Preto', size: 'M', stock: 5 }]
      ).map((v) => ({
        sku: v.sku ?? uniqueSku(),
        color: v.color,
        size: v.size,
        stock: v.stock,
      })),
    });
  if (![200, 201].includes(res.status)) {
    throw new Error(
      `createProduct falhou: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  createdProducts.push(res.body.id);
  return res.body as {
    id: string;
    slug: string;
    variants: Array<{ id: string; sku: string; stock: number }>;
  };
}

/** Deixa a conta pronta para o checkout: nome + CPF válido + endereço. */
export async function prepareBuyer(
  ctx: TestContext,
  token: string,
  cpf = '52998224725',
) {
  const profile = await ctx
    .http()
    .patch('/me')
    .set(auth(token))
    .send({ name: 'Comprador Teste', cpf });
  expectOk(profile.status);
  const address = await ctx.http().post('/me/addresses').set(auth(token)).send({
    label: 'Casa',
    cep: '13010000',
    street: 'Rua Teste',
    number: '10',
    neighborhood: 'Centro',
    city: 'Campinas',
    state: 'SP',
  });
  expectOk(address.status);
  return address.body as { id: string };
}

/** Compra real pelo fluxo carrinho -> checkout. */
export async function buy(
  ctx: TestContext,
  token: string,
  variantId: string,
  quantity = 1,
) {
  const add = await ctx
    .http()
    .post('/me/cart/items')
    .set(auth(token))
    .send({ variantId, quantity });
  expectOk(add.status);
  const order = await ctx
    .http()
    .post('/me/orders/checkout')
    .set(auth(token))
    .send({});
  if (![200, 201].includes(order.status)) {
    throw new Error(
      `checkout falhou: ${order.status} ${JSON.stringify(order.body)}`,
    );
  }
  return order.body as {
    id: string;
    number: number;
    items: Array<{ id: string }>;
  };
}

/** Espera o worker da fila processar (status deixa de ser QUEUED). */
export async function waitForDeliveries(
  prisma: PrismaClient,
  userId: string,
  timeoutMs = 8000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const rows = await prisma.notificationDelivery.findMany({
      where: { userId },
    });
    if (rows.length && rows.every((r) => r.status !== 'QUEUED')) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
  return prisma.notificationDelivery.findMany({ where: { userId } });
}

/** PNG mínimo válido (1x1) para testes de upload. */
export const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5d7a3' +
    '2b0000000049454e44ae426082',
  'hex',
);

const createdProducts: string[] = [];

export async function destroyTestApp(ctx: TestContext) {
  // Produtos de teste saem da vitrine (não dá para apagar: pedidos os referenciam).
  if (createdProducts.length) {
    await ctx.prisma.product.updateMany({
      where: { id: { in: createdProducts.splice(0) } },
      data: { isActive: false },
    });
  }
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
  const register = await ctx
    .http()
    .post('/auth/register')
    .send({
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
