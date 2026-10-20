import { randomUUID } from 'crypto';
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
  TestContext,
  TINY_PNG,
  uniqueSku,
} from './helpers';

/**
 * Sprint 3 — US31 (catálogo base), US10, US11, US12, US13, US14, US15.
 */
describe('Catálogo e compra (US31, US10, US11, US12, US13, US14, US15)', () => {
  let ctx: TestContext;
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await createAdmin(ctx);
  }, 60000);

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  describe('US31 - catálogo base (identificação, variações, estoque, admin)', () => {
    it('somente ADMIN cadastra produto; cliente recebe 403', async () => {
      const customer = await registerAndLogin(ctx);
      const res = await ctx
        .http()
        .post('/admin/products')
        .set(auth(customer.accessToken))
        .send({});
      expect(res.status).toBe(403);
      const anon = await ctx.http().post('/admin/products').send({});
      expect(anon.status).toBe(401);
    });

    it('produto tem id estável, slug único e SKU por variação', async () => {
      const name = `Mochila Identidade ${Date.now()}`;
      const p1 = await createProduct(ctx, admin.accessToken, {
        name,
        variants: [
          { color: 'Preto', size: 'U', stock: 3 },
          { color: 'Cinza', size: 'U', stock: 0 },
        ],
      });
      const p2 = await createProduct(ctx, admin.accessToken, { name });
      expect(p1.id).not.toBe(p2.id);
      expect(p1.slug).not.toBe(p2.slug);

      const byId = await ctx.http().get(`/products/${p1.id}`);
      const bySlug = await ctx.http().get(`/products/${p1.slug}`);
      expectOk(byId.status);
      expect(bySlug.body.id).toBe(p1.id);

      const dupSku = await ctx
        .http()
        .post(`/admin/products/${p1.id}/variants`)
        .set(auth(admin.accessToken))
        .send({ sku: p1.variants[0].sku, color: 'Azul', stock: 1 });
      expect(dupSku.status).toBe(409);
    });

    it('produto desativado some da busca mas o id continua resolvendo (favoritos/pedidos)', async () => {
      const name = `Produto Desativavel ${Date.now()}`;
      const p = await createProduct(ctx, admin.accessToken, { name });
      const del = await ctx
        .http()
        .delete(`/admin/products/${p.id}`)
        .set(auth(admin.accessToken));
      expectOk(del.status);

      const search = await ctx.http().get('/products').query({ q: name });
      expect(search.body.items.find((i: any) => i.id === p.id)).toBeUndefined();

      const detail = await ctx.http().get(`/products/${p.id}`);
      expectOk(detail.status);
      expect(detail.body.isActive).toBe(false);
      expect(detail.body.inStock).toBe(false);
    });

    it('upload de imagem de produto pelo admin', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const up = await ctx
        .http()
        .post(`/admin/products/${p.id}/images`)
        .set(auth(admin.accessToken))
        .field('alt', 'Frente')
        .attach('image', TINY_PNG, {
          filename: 'p.png',
          contentType: 'image/png',
        });
      expectOk(up.status);
      const detail = await ctx.http().get(`/products/${p.id}`);
      expect(detail.body.images).toHaveLength(1);
      expect(detail.body.images[0].url).toMatch(/^\/uploads\/products\//);
    });
  });

  describe('US11 - detalhes do produto', () => {
    it('retorna ficha técnica, variações (cor/tamanho), estoque e imagens', async () => {
      const p = await createProduct(ctx, admin.accessToken, {
        variants: [
          { color: 'Preto', size: '40', stock: 2 },
          { color: 'Preto', size: '41', stock: 0 },
          { color: 'Azul', size: '40', stock: 7 },
        ],
      });
      const res = await ctx.http().get(`/products/${p.id}`);
      expectOk(res.status);
      expect(res.body.specs).toEqual([{ label: 'Material', value: 'Teste' }]);
      expect(res.body.totalStock).toBe(9);
      expect(res.body.sizes.sort()).toEqual(['40', '41']);
      expect(res.body.colors.map((c: any) => c.name).sort()).toEqual([
        'Azul',
        'Preto',
      ]);
      const outOfStock = res.body.variants.find((v: any) => v.size === '41');
      expect(outOfStock).toMatchObject({ stock: 0, available: false });
      expect(res.body.rating).toMatchObject({ average: 0, count: 0 });
    });

    it('estoque "em tempo real": endpoint reflete mudança imediata e não é cacheado', async () => {
      const p = await createProduct(ctx, admin.accessToken, {
        variants: [{ color: 'Preto', stock: 4 }],
      });
      const before = await ctx.http().get(`/products/${p.id}/stock`);
      expect(before.headers['cache-control']).toBe('no-store');
      expect(before.body.totalStock).toBe(4);

      await ctx
        .http()
        .patch(`/admin/variants/${p.variants[0].id}`)
        .set(auth(admin.accessToken))
        .send({ stock: 1 });
      const after = await ctx.http().get(`/products/${p.id}/stock`);
      expect(after.body.totalStock).toBe(1);
    });

    it('id inexistente = 404', async () => {
      expect((await ctx.http().get(`/products/${randomUUID()}`)).status).toBe(
        404,
      );
      expect((await ctx.http().get('/products/nao-existe-slug')).status).toBe(
        404,
      );
    });
  });

  describe('US13 - favoritos', () => {
    it('adiciona/remove com 1 chamada, é idempotente e leva aos detalhes do produto', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const s = await registerAndLogin(ctx);

      const add1 = await ctx
        .http()
        .put(`/me/favorites/${p.id}`)
        .set(auth(s.accessToken));
      const add2 = await ctx
        .http()
        .put(`/me/favorites/${p.id}`)
        .set(auth(s.accessToken));
      expectOk(add1.status);
      expectOk(add2.status);
      expect(add2.body.isFavorite).toBe(true);
      expect(
        await ctx.prisma.favorite.count({ where: { userId: s.user.id } }),
      ).toBe(1);

      const ids = await ctx
        .http()
        .get('/me/favorites/ids')
        .set(auth(s.accessToken));
      expect(ids.body.productIds).toEqual([p.id]);

      const list = await ctx
        .http()
        .get('/me/favorites')
        .set(auth(s.accessToken));
      expect(list.body.items).toHaveLength(1);
      const card = list.body.items[0].product;
      expect(card).toMatchObject({
        id: p.id,
        priceCents: 10000,
        inStock: true,
      });

      // Navegação favoritos -> detalhes com o mesmo id
      const detail = await ctx.http().get(`/products/${card.id}`);
      expect(detail.body.id).toBe(p.id);

      const rem = await ctx
        .http()
        .delete(`/me/favorites/${p.id}`)
        .set(auth(s.accessToken));
      expect(rem.body.isFavorite).toBe(false);
      const remAgain = await ctx
        .http()
        .delete(`/me/favorites/${p.id}`)
        .set(auth(s.accessToken));
      expectOk(remAgain.status);
      expect(
        await ctx.prisma.favorite.count({ where: { userId: s.user.id } }),
      ).toBe(0);
    });

    it('lista é por usuário e exige login; produto inexistente = 404', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const a = await registerAndLogin(ctx);
      const b = await registerAndLogin(ctx);
      await ctx.http().put(`/me/favorites/${p.id}`).set(auth(a.accessToken));
      const listB = await ctx
        .http()
        .get('/me/favorites')
        .set(auth(b.accessToken));
      expect(listB.body.items).toHaveLength(0);
      expect((await ctx.http().get('/me/favorites')).status).toBe(401);
      const missing = await ctx
        .http()
        .put(`/me/favorites/${randomUUID()}`)
        .set(auth(a.accessToken));
      expect(missing.status).toBe(404);
      const badId = await ctx
        .http()
        .put('/me/favorites/abc')
        .set(auth(a.accessToken));
      expect(badId.status).toBe(400);
    });
  });

  describe('US10 - busca com filtros', () => {
    // Marcador aleatório só com letras: evita casar (por similaridade) com produtos
    // de execuções anteriores que ficaram no mesmo banco.
    const tag = Array.from({ length: 12 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26)),
    ).join('');
    let catA: string;
    let catB: string;
    let brandX: string;
    let brandY: string;

    beforeAll(async () => {
      const mk = async (path: string, name: string) =>
        (
          await ctx
            .http()
            .post(path)
            .set(auth(admin.accessToken))
            .send({ name })
        ).body.id as string;
      catA = await mk('/admin/categories', `Cat A ${tag}`);
      catB = await mk('/admin/categories', `Cat B ${tag}`);
      brandX = await mk('/admin/brands', `Marca X ${tag}`);
      brandY = await mk('/admin/brands', `Marca Y ${tag}`);
      const data: Array<[string, number, string, string, number]> = [
        [`Luminaria ${tag} Alfa`, 5000, catA, brandX, 3],
        [`Luminaria ${tag} Beta`, 15000, catA, brandY, 0],
        [`Cadeira ${tag} Gama`, 25000, catB, brandX, 2],
        [`Luminaria ${tag} Delta`, 9000, catB, brandX, 1],
      ];
      for (const [name, priceCents, categoryId, brandId, stock] of data) {
        await createProduct(ctx, admin.accessToken, {
          name,
          priceCents,
          categoryId,
          brandId,
          variants: [{ color: 'Preto', stock }],
        });
      }
    });

    const search = (query: Record<string, string | number | boolean>) =>
      ctx.http().get('/products').query(query);
    const names = (res: any) =>
      res.body.items.map((i: any) => i.name.split(' ').pop());

    it('busca por nome ignora acento e caixa', async () => {
      const res = await search({ q: `LUMINÁRIA ${tag}` });
      expectOk(res.status);
      expect(res.body.total).toBe(3);
    });

    it('tolera erro de digitação (similaridade)', async () => {
      const res = await search({ q: `luminaira ${tag}` });
      expect(res.body.total).toBe(3);
    });

    it('filtros combinados: categoria + marca + faixa de preço', async () => {
      const res = await search({
        q: tag,
        categoryIds: catA,
        brandIds: brandX,
        minPrice: 1000,
        maxPrice: 10000,
      });
      expect(names(res)).toEqual(['Alfa']);

      const twoCats = await search({
        q: tag,
        categoryIds: `${catA},${catB}`,
        brandIds: brandX,
      });
      expect(names(twoCats).sort()).toEqual(['Alfa', 'Delta', 'Gama']);

      const inStock = await search({
        q: tag,
        inStock: true,
        categoryIds: catA,
      });
      expect(names(inStock)).toEqual(['Alfa']);
    });

    it('ordena por menor preço, maior preço e relevância', async () => {
      expect(names(await search({ q: tag, sort: 'price_asc' }))).toEqual([
        'Alfa',
        'Delta',
        'Beta',
        'Gama',
      ]);
      expect(names(await search({ q: tag, sort: 'price_desc' }))).toEqual([
        'Gama',
        'Beta',
        'Delta',
        'Alfa',
      ]);
      const rel = await search({ q: `luminaria ${tag}`, sort: 'relevance' });
      // relevância: todos casam igual no termo -> em estoque antes de esgotado
      expect(names(rel).pop()).toBe('Beta');
    });

    it('pagina resultados', async () => {
      const p1 = await search({
        q: tag,
        sort: 'price_asc',
        pageSize: 3,
        page: 1,
      });
      const p2 = await search({
        q: tag,
        sort: 'price_asc',
        pageSize: 3,
        page: 2,
      });
      expect(p1.body).toMatchObject({ total: 4, totalPages: 2, page: 1 });
      expect(names(p1)).toEqual(['Alfa', 'Delta', 'Beta']);
      expect(names(p2)).toEqual(['Gama']);
    });

    it('valida parâmetros', async () => {
      expect((await search({ sort: 'mais_vendidos' })).status).toBe(400);
      expect((await search({ categoryIds: 'nao-e-uuid' })).status).toBe(400);
      expect((await search({ pageSize: 500 })).status).toBe(400);
      // % e _ do usuário não viram curinga do LIKE
      const pct = await search({ q: `${tag}%_` });
      expectOk(pct.status);
      expect(pct.body.total).toBe(4);
    });

    it('desempenho: busca em menos de 1 segundo com 5.000 produtos no banco', async () => {
      const perfTag = `perf${Date.now().toString(36)}`;
      const words = [
        'tenis',
        'camiseta',
        'mochila',
        'caneca',
        'fone',
        'garrafa',
        'jaqueta',
        'relogio',
      ];
      // Inserção em massa direto no banco (sem triggers de auditoria, só nesta sessão).
      await ctx.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL session_replication_role = replica`,
        );
        await tx.$executeRaw`
          INSERT INTO "Product" (id, slug, name, description, "searchText", "priceCents",
                                 "categoryId", "brandId", "updatedAt")
          SELECT gen_random_uuid()::text,
                 ${perfTag} || '-' || g,
                 initcap(w) || ' ' || ${perfTag} || ' ' || g,
                 'carga de desempenho',
                 w || ' ' || ${perfTag} || ' ' || g || ' modelo ' || (g % 37),
                 1000 + (g * 37) % 50000,
                 CASE WHEN g % 2 = 0 THEN ${catA} ELSE ${catB} END,
                 CASE WHEN g % 3 = 0 THEN ${brandX} ELSE ${brandY} END,
                 now()
          FROM generate_series(1, 5000) g,
               LATERAL (SELECT (${words}::text[])[1 + g % 8] AS w) x
        `;
        await tx.$executeRaw`
          INSERT INTO "ProductVariant" (id, "productId", sku, color, stock, "updatedAt")
          SELECT gen_random_uuid()::text, p.id, upper(p.slug), 'Preto', (random() * 5)::int, now()
          FROM "Product" p WHERE p.slug LIKE ${perfTag + '-%'}
        `;
      });
      await ctx.prisma.$executeRawUnsafe('ANALYZE "Product"');
      await ctx.prisma.$executeRawUnsafe('ANALYZE "ProductVariant"');

      const queries: Array<Record<string, string | number | boolean>> = [
        { q: 'mochila' },
        { q: 'camisetaa' },
        { q: 'tenis modelo', sort: 'price_asc' },
        {
          categoryIds: catA,
          brandIds: brandX,
          minPrice: 2000,
          maxPrice: 30000,
          sort: 'price_desc',
        },
        { q: 'fone', inStock: true, page: 3 },
        { sort: 'relevance', page: 10 },
      ];
      const timings: number[] = [];
      try {
        for (let round = 0; round < 5; round++) {
          for (const q of queries) {
            const t0 = Date.now();
            const res = await search(q);
            timings.push(Date.now() - t0);
            expectOk(res.status);
          }
        }
      } finally {
        await ctx.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL session_replication_role = replica`,
          );
          await tx.$executeRaw`DELETE FROM "ProductVariant" WHERE "productId" IN (SELECT id FROM "Product" WHERE slug LIKE ${perfTag + '-%'})`;
          await tx.$executeRaw`DELETE FROM "Product" WHERE slug LIKE ${perfTag + '-%'}`;
        });
      }
      timings.sort((a, b) => a - b);
      const p95 = timings[Math.floor(timings.length * 0.95) - 1];
      const max = timings[timings.length - 1];
      // eslint-disable-next-line no-console
      console.log(
        `[US10] busca HTTP com 5.000 produtos: p95=${p95}ms max=${max}ms (n=${timings.length})`,
      );
      expect(max).toBeLessThan(1000);
    }, 120000);
  });

  describe('US14 - carrinho', () => {
    it('altera quantidade, remove e recalcula subtotais com preços reais', async () => {
      const p1 = await createProduct(ctx, admin.accessToken, {
        priceCents: 2590,
        variants: [{ color: 'Azul', stock: 10 }],
      });
      const p2 = await createProduct(ctx, admin.accessToken, {
        priceCents: 10000,
        variants: [{ color: 'Preto', stock: 3 }],
      });
      const s = await registerAndLogin(ctx);
      const a = auth(s.accessToken);

      await ctx
        .http()
        .post('/me/cart/items')
        .set(a)
        .send({ variantId: p1.variants[0].id, quantity: 2 });
      const cart = await ctx
        .http()
        .post('/me/cart/items')
        .set(a)
        .send({ variantId: p2.variants[0].id, quantity: 1 });
      expect(cart.body.subtotalCents).toBe(2 * 2590 + 10000);
      expect(cart.body.itemsCount).toBe(3);

      const item1 = cart.body.items.find(
        (i: any) => i.variantId === p1.variants[0].id,
      );
      const upd = await ctx
        .http()
        .patch(`/me/cart/items/${item1.id}`)
        .set(a)
        .send({ quantity: 5 });
      expectOk(upd.status);
      const updItem = upd.body.items.find((i: any) => i.id === item1.id);
      expect(updItem.subtotalCents).toBe(5 * 2590);
      expect(upd.body.subtotalCents).toBe(5 * 2590 + 10000);

      // adicionar de novo soma à quantidade existente
      const again = await ctx
        .http()
        .post('/me/cart/items')
        .set(a)
        .send({ variantId: p1.variants[0].id, quantity: 1 });
      expect(
        again.body.items.find((i: any) => i.id === item1.id).quantity,
      ).toBe(6);

      const rem = await ctx.http().delete(`/me/cart/items/${item1.id}`).set(a);
      expect(rem.body.items).toHaveLength(1);
      expect(rem.body.subtotalCents).toBe(10000);

      // preço muda no catálogo -> carrinho reflete (não guarda preço velho)
      await ctx
        .http()
        .patch(`/admin/products/${p2.id}`)
        .set(auth(admin.accessToken))
        .send({ priceCents: 12000 });
      const fresh = await ctx.http().get('/me/cart').set(a);
      expect(fresh.body.subtotalCents).toBe(12000);
    });

    it('bloqueia quantidade acima do estoque no backend (409 com disponível)', async () => {
      const p = await createProduct(ctx, admin.accessToken, {
        variants: [{ color: 'Preto', stock: 3 }],
      });
      const s = await registerAndLogin(ctx);
      const a = auth(s.accessToken);

      const tooMany = await ctx
        .http()
        .post('/me/cart/items')
        .set(a)
        .send({ variantId: p.variants[0].id, quantity: 4 });
      expect(tooMany.status).toBe(409);
      expect(tooMany.body).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        available: 3,
      });

      const ok = await ctx
        .http()
        .post('/me/cart/items')
        .set(a)
        .send({ variantId: p.variants[0].id, quantity: 3 });
      const itemId = ok.body.items[0].id;
      const patch = await ctx
        .http()
        .patch(`/me/cart/items/${itemId}`)
        .set(a)
        .send({ quantity: 10 });
      expect(patch.status).toBe(409);
      expect(patch.body.available).toBe(3);

      expect(
        (
          await ctx
            .http()
            .patch(`/me/cart/items/${itemId}`)
            .set(a)
            .send({ quantity: 0 })
        ).status,
      ).toBe(400);
      expect(
        (
          await ctx
            .http()
            .patch(`/me/cart/items/${itemId}`)
            .set(a)
            .send({ quantity: -2 })
        ).status,
      ).toBe(400);
      expect(
        (
          await ctx
            .http()
            .patch(`/me/cart/items/${itemId}`)
            .set(a)
            .send({ quantity: 1.5 })
        ).status,
      ).toBe(400);
    });

    it('estoque que caiu depois aparece como alerta e barra o checkout', async () => {
      const p = await createProduct(ctx, admin.accessToken, {
        variants: [{ color: 'Preto', stock: 5 }],
      });
      const s = await registerAndLogin(ctx);
      await prepareBuyer(ctx, s.accessToken);
      const a = auth(s.accessToken);
      await ctx
        .http()
        .post('/me/cart/items')
        .set(a)
        .send({ variantId: p.variants[0].id, quantity: 4 });
      await ctx
        .http()
        .patch(`/admin/variants/${p.variants[0].id}`)
        .set(auth(admin.accessToken))
        .send({ stock: 2 });

      const validate = await ctx.http().post('/me/cart/validate').set(a);
      expect(validate.body.ok).toBe(false);
      expect(validate.body.items[0]).toMatchObject({
        issue: 'INSUFFICIENT_STOCK',
        availableStock: 2,
      });

      const checkout = await ctx
        .http()
        .post('/me/orders/checkout')
        .set(a)
        .send({});
      expect(checkout.status).toBe(409);
      expect(checkout.body.code).toBe('CART_HAS_ISSUES');
    });

    it('item de outro usuário não pode ser alterado', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const owner = await registerAndLogin(ctx);
      const other = await registerAndLogin(ctx);
      const added = await ctx
        .http()
        .post('/me/cart/items')
        .set(auth(owner.accessToken))
        .send({ variantId: p.variants[0].id, quantity: 1 });
      const itemId = added.body.items[0].id;
      expect(
        (
          await ctx
            .http()
            .patch(`/me/cart/items/${itemId}`)
            .set(auth(other.accessToken))
            .send({ quantity: 2 })
        ).status,
      ).toBe(404);
      expect(
        (
          await ctx
            .http()
            .delete(`/me/cart/items/${itemId}`)
            .set(auth(other.accessToken))
        ).status,
      ).toBe(404);
    });

    it('checkout baixa o estoque e esvazia o carrinho; última unidade não é vendida duas vezes', async () => {
      const p = await createProduct(ctx, admin.accessToken, {
        variants: [{ color: 'Preto', stock: 1 }],
      });
      const a = await registerAndLogin(ctx);
      const b = await registerAndLogin(ctx);
      await prepareBuyer(ctx, a.accessToken);
      await prepareBuyer(ctx, b.accessToken);
      await ctx
        .http()
        .post('/me/cart/items')
        .set(auth(a.accessToken))
        .send({ variantId: p.variants[0].id, quantity: 1 });
      await ctx
        .http()
        .post('/me/cart/items')
        .set(auth(b.accessToken))
        .send({ variantId: p.variants[0].id, quantity: 1 });

      const [ra, rb] = await Promise.all([
        ctx
          .http()
          .post('/me/orders/checkout')
          .set(auth(a.accessToken))
          .send({}),
        ctx
          .http()
          .post('/me/orders/checkout')
          .set(auth(b.accessToken))
          .send({}),
      ]);
      const statuses = [ra.status, rb.status].sort();
      expect(statuses).toEqual([201, 409]);

      const variant = await ctx.prisma.productVariant.findUniqueOrThrow({
        where: { id: p.variants[0].id },
      });
      expect(variant.stock).toBe(0);
      const winner = ra.status === 201 ? a : b;
      const winnerCart = await ctx
        .http()
        .get('/me/cart')
        .set(auth(winner.accessToken));
      expect(winnerCart.body.items).toHaveLength(0);
    });

    it('checkout exige CPF válido e endereço (dados fiscais)', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const s = await registerAndLogin(ctx);
      await ctx
        .http()
        .post('/me/cart/items')
        .set(auth(s.accessToken))
        .send({ variantId: p.variants[0].id, quantity: 1 });
      const res = await ctx
        .http()
        .post('/me/orders/checkout')
        .set(auth(s.accessToken))
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PROFILE_INCOMPLETE');
    });
  });

  describe('US15 - frete', () => {
    it('valida CEP e, sem credencial, informa "não configurado" sem inventar cotação', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const s = await registerAndLogin(ctx);
      const a = auth(s.accessToken);

      const empty = await ctx
        .http()
        .post('/me/cart/shipping-quote')
        .set(a)
        .send({ cep: '13010-000' });
      expect(empty.status).toBe(400);
      expect(empty.body.code).toBe('EMPTY_CART');

      await ctx
        .http()
        .post('/me/cart/items')
        .set(a)
        .send({ variantId: p.variants[0].id, quantity: 1 });
      expect(
        (
          await ctx
            .http()
            .post('/me/cart/shipping-quote')
            .set(a)
            .send({ cep: '1301' })
        ).status,
      ).toBe(400);
      expect(
        (
          await ctx
            .http()
            .post('/me/cart/shipping-quote')
            .set(a)
            .send({ cep: '00000-000' })
        ).status,
      ).toBe(400);
      expect(
        (
          await ctx
            .http()
            .post('/me/cart/shipping-quote')
            .set(a)
            .send({ cep: 'abcdefgh' })
        ).status,
      ).toBe(400);

      const quote = await ctx
        .http()
        .post('/me/cart/shipping-quote')
        .set(a)
        .send({ cep: '13010-000' });
      expect(quote.status).toBe(503);
      expect(quote.body.code).toBe('SHIPPING_NOT_CONFIGURED');
      expect(quote.body.options).toBeUndefined();
    });

    it('checkout com opção de frete também falha de forma explícita sem integração', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const s = await registerAndLogin(ctx);
      await prepareBuyer(ctx, s.accessToken);
      await ctx
        .http()
        .post('/me/cart/items')
        .set(auth(s.accessToken))
        .send({ variantId: p.variants[0].id, quantity: 1 });
      const res = await ctx
        .http()
        .post('/me/orders/checkout')
        .set(auth(s.accessToken))
        .send({ shippingServiceId: '1' });
      expect(res.status).toBe(503);
      // nada foi vendido
      const v = await ctx.prisma.productVariant.findUniqueOrThrow({
        where: { id: p.variants[0].id },
      });
      expect(v.stock).toBe(5);
    });
  });

  describe('US12 - avaliações', () => {
    it('quem não comprou não avalia (nem forçando a API)', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const s = await registerAndLogin(ctx);
      const elig = await ctx
        .http()
        .get(`/products/${p.id}/reviews/eligibility`)
        .set(auth(s.accessToken));
      expect(elig.body).toMatchObject({
        canReview: false,
        reason: 'NOT_PURCHASED',
      });

      const res = await ctx
        .http()
        .post(`/products/${p.id}/reviews`)
        .set(auth(s.accessToken))
        .field('rating', '5');
      expect(res.status).toBe(403);

      // Tentativa de "provar" compra mandando o item de pedido de outra pessoa
      const buyer = await registerAndLogin(ctx);
      await prepareBuyer(ctx, buyer.accessToken);
      const order = await buy(ctx, buyer.accessToken, p.variants[0].id);
      const forged = await ctx
        .http()
        .post(`/products/${p.id}/reviews`)
        .set(auth(s.accessToken))
        .field('rating', '5')
        .field('orderItemId', order.items[0].id);
      expect(forged.status).toBe(400); // campo não aceito
      expect(
        await ctx.prisma.review.count({ where: { productId: p.id } }),
      ).toBe(0);

      expect(
        (
          await ctx
            .http()
            .post(`/products/${p.id}/reviews`)
            .field('rating', '5')
        ).status,
      ).toBe(401);
    });

    it('comprador avalia com fotos; média é recalculada; 1 avaliação por compra', async () => {
      const p = await createProduct(ctx, admin.accessToken, {
        variants: [{ color: 'Preto', stock: 10 }],
      });
      const b1 = await registerAndLogin(ctx);
      const b2 = await registerAndLogin(ctx);
      await prepareBuyer(ctx, b1.accessToken);
      await prepareBuyer(ctx, b2.accessToken, '11144477735');
      await buy(ctx, b1.accessToken, p.variants[0].id);
      await buy(ctx, b2.accessToken, p.variants[0].id);

      expect(
        (
          await ctx
            .http()
            .get(`/products/${p.id}/reviews/eligibility`)
            .set(auth(b1.accessToken))
        ).body.canReview,
      ).toBe(true);

      for (const rating of ['0', '6', '4.5', 'cinco']) {
        const bad = await ctx
          .http()
          .post(`/products/${p.id}/reviews`)
          .set(auth(b1.accessToken))
          .field('rating', rating);
        expect(bad.status).toBe(400);
      }

      const r1 = await ctx
        .http()
        .post(`/products/${p.id}/reviews`)
        .set(auth(b1.accessToken))
        .field('rating', '5')
        .field('comment', 'Excelente')
        .attach('photos', TINY_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .attach('photos', TINY_PNG, {
          filename: 'b.png',
          contentType: 'image/png',
        });
      expectOk(r1.status);
      expect(r1.body.photos).toHaveLength(2);

      const dup = await ctx
        .http()
        .post(`/products/${p.id}/reviews`)
        .set(auth(b1.accessToken))
        .field('rating', '1');
      expect(dup.status).toBe(409);

      const fake = await ctx
        .http()
        .post(`/products/${p.id}/reviews`)
        .set(auth(b2.accessToken))
        .field('rating', '2')
        .attach('photos', Buffer.from('texto'), {
          filename: 'x.png',
          contentType: 'image/png',
        });
      expect(fake.status).toBe(400);
      expect(
        await ctx.prisma.review.count({ where: { productId: p.id } }),
      ).toBe(1);

      const r2 = await ctx
        .http()
        .post(`/products/${p.id}/reviews`)
        .set(auth(b2.accessToken))
        .field('rating', '2');
      expectOk(r2.status);

      const detail = await ctx.http().get(`/products/${p.id}`);
      expect(detail.body.rating).toMatchObject({ average: 3.5, count: 2 });
      expect(
        detail.body.rating.distribution.find((d: any) => d.stars === 5).count,
      ).toBe(1);

      const list = await ctx.http().get(`/products/${p.id}/reviews`);
      expect(list.body.items).toHaveLength(2);
      const withPhotos = list.body.items.find((i: any) => i.rating === 5);
      expect(withPhotos.authorName).toBe('Comprador T.'); // nome do perfil abreviado
      expect(withPhotos.photos[0].url).toMatch(/^\/uploads\/reviews\/.+\.png$/);

      // média também aparece no cartão da busca/vitrine
      const card = await ctx
        .http()
        .get('/products')
        .query({ q: detail.body.name });
      expect(card.body.items.find((i: any) => i.id === p.id).ratingAvg).toBe(
        3.5,
      );
    });

    it('item do pedido mostra se pode avaliar', async () => {
      const p = await createProduct(ctx, admin.accessToken);
      const s = await registerAndLogin(ctx);
      await prepareBuyer(ctx, s.accessToken);
      const order = await buy(ctx, s.accessToken, p.variants[0].id);
      const before = await ctx
        .http()
        .get(`/me/orders/${order.id}`)
        .set(auth(s.accessToken));
      expect(before.body.items[0].canReview).toBe(true);
      await ctx
        .http()
        .post(`/products/${p.id}/reviews`)
        .set(auth(s.accessToken))
        .field('rating', '4');
      const after = await ctx
        .http()
        .get(`/me/orders/${order.id}`)
        .set(auth(s.accessToken));
      expect(after.body.items[0].canReview).toBe(false);

      const other = await registerAndLogin(ctx);
      expect(
        (
          await ctx
            .http()
            .get(`/me/orders/${order.id}`)
            .set(auth(other.accessToken))
        ).status,
      ).toBe(404);
    });
  });

  it('SKU inválido é recusado no cadastro', async () => {
    const refs = await ctx.http().get('/categories');
    expectOk(refs.status);
    const res = await ctx
      .http()
      .post(`/admin/products`)
      .set(auth(admin.accessToken))
      .send({
        name: 'Produto SKU ruim',
        description: 'Descrição suficiente',
        priceCents: 100,
        categoryId: randomUUID(),
        brandId: randomUUID(),
        variants: [{ sku: 'sku minúsculo', stock: 1 }],
      });
    expect(res.status).toBe(400);
    expect(uniqueSku()).toMatch(/^[A-Z0-9-]+$/);
  });
});
