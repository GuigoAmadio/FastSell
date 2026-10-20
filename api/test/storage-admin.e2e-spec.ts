import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import {
  auth,
  createAdmin,
  createProduct,
  createTestApp,
  destroyTestApp,
  expectOk,
  registerAndLogin,
  TestContext,
  TINY_PNG,
} from './helpers';

/**
 * US31 (painel admin) e US06 (fotos em armazenamento S3).
 * O S3 é simulado por um servidor compatível local (moto). Se o moto não estiver
 * instalado (`pip install "moto[server]"`), os testes de S3 são pulados.
 */
const MOTO_PORT = 5055;
const ENDPOINT = `http://127.0.0.1:${MOTO_PORT}`;
const BUCKET = 'fastsell-teste';
const hasMoto =
  spawnSync('python3', ['-c', 'import moto.server'], { stdio: 'ignore' })
    .status === 0;

describe('Painel admin (US31)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  it('lista produtos para o admin, inclusive desativados, com filtro', async () => {
    const admin = await createAdmin(ctx);
    const tag = `Painel${Date.now()}`;
    const ativo = await createProduct(ctx, admin.accessToken, {
      name: `${tag} Ativo`,
      variants: [
        { color: 'Preto', size: 'P', stock: 2 },
        { color: 'Preto', size: 'M', stock: 3 },
      ],
    });
    const inativo = await createProduct(ctx, admin.accessToken, {
      name: `${tag} Inativo`,
    });
    await ctx
      .http()
      .delete(`/admin/products/${inativo.id}`)
      .set(auth(admin.accessToken));

    const all = await ctx
      .http()
      .get('/admin/products')
      .query({ q: tag })
      .set(auth(admin.accessToken));
    expectOk(all.status);
    expect(all.body.total).toBe(2);
    const row = all.body.items.find((i: any) => i.id === ativo.id);
    expect(row).toMatchObject({
      totalStock: 5,
      variantsCount: 2,
      isActive: true,
    });

    const onlyInactive = await ctx
      .http()
      .get('/admin/products')
      .query({ q: tag, status: 'inactive' })
      .set(auth(admin.accessToken));
    expect(onlyInactive.body.items.map((i: any) => i.id)).toEqual([inativo.id]);

    // reativar volta para a vitrine
    await ctx
      .http()
      .patch(`/admin/products/${inativo.id}`)
      .set(auth(admin.accessToken))
      .send({ isActive: true });
    const vitrine = await ctx.http().get('/products').query({ q: tag });
    expect(vitrine.body.total).toBe(2);

    const customer = await registerAndLogin(ctx);
    const denied = await ctx
      .http()
      .get('/admin/products')
      .set(auth(customer.accessToken));
    expect(denied.status).toBe(403);
  });
});

(hasMoto ? describe : describe.skip)('Fotos em S3 (US06)', () => {
  let ctx: TestContext;
  let moto: ChildProcess;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    moto = spawn('python3', ['-m', 'moto.server', '-p', String(MOTO_PORT)], {
      stdio: 'ignore',
    });
    // espera o servidor subir
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(ENDPOINT);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const env = {
      STORAGE_DRIVER: 's3',
      S3_BUCKET: BUCKET,
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: ENDPOINT,
      S3_ACCESS_KEY_ID: 'teste',
      S3_SECRET_ACCESS_KEY: 'teste',
    };
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    const s3 = new S3Client({
      region: 'us-east-1',
      endpoint: ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' },
    });
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    // Igual ao bucket real: leitura pública das imagens (escrita só com credencial).
    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: BUCKET,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${BUCKET}/*`,
            },
          ],
        }),
      }),
    );
    ctx = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await destroyTestApp(ctx);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    moto?.kill();
  });

  it('foto de perfil vai para o bucket; trocar a foto apaga a anterior', async () => {
    const s = await registerAndLogin(ctx);
    const first = await ctx
      .http()
      .post('/me/photo')
      .set(auth(s.accessToken))
      .attach('photo', TINY_PNG, {
        filename: 'a.png',
        contentType: 'image/png',
      });
    expectOk(first.status);
    const url1: string = first.body.user.photoUrl;
    expect(url1.startsWith(`${ENDPOINT}/${BUCKET}/avatars/`)).toBe(true);

    const get1 = await fetch(url1);
    expect(get1.status).toBe(200);
    expect(get1.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await get1.arrayBuffer()).equals(TINY_PNG)).toBe(true);

    const second = await ctx
      .http()
      .post('/me/photo')
      .set(auth(s.accessToken))
      .attach('photo', TINY_PNG, {
        filename: 'b.png',
        contentType: 'image/png',
      });
    const url2: string = second.body.user.photoUrl;
    expect(url2).not.toBe(url1);
    expect((await fetch(url2)).status).toBe(200);
    expect((await fetch(url1)).status).toBe(404);
  });

  it('imagem de produto do admin também vai para o bucket', async () => {
    const admin = await createAdmin(ctx);
    const p = await createProduct(ctx, admin.accessToken);
    const up = await ctx
      .http()
      .post(`/admin/products/${p.id}/images`)
      .set(auth(admin.accessToken))
      .attach('image', TINY_PNG, {
        filename: 'p.png',
        contentType: 'image/png',
      });
    expectOk(up.status);
    expect(up.body.url.startsWith(`${ENDPOINT}/${BUCKET}/products/`)).toBe(
      true,
    );
    expect((await fetch(up.body.url)).status).toBe(200);

    const del = await ctx
      .http()
      .delete(`/admin/products/${p.id}/images/${up.body.id}`)
      .set(auth(admin.accessToken));
    expectOk(del.status);
    expect((await fetch(up.body.url)).status).toBe(404);
  });

  it('arquivo falso continua sendo recusado antes de chegar ao bucket', async () => {
    const s = await registerAndLogin(ctx);
    const fake = await ctx
      .http()
      .post('/me/photo')
      .set(auth(s.accessToken))
      .attach('photo', Buffer.from('nao sou png'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(fake.status).toBe(400);
  });
});
