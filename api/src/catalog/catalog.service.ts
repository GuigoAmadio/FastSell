import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { escapeLike, normalizeSearch } from '../common/text';
import { SearchProductsDto } from './dto/catalog.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Include usado por todo cartão de produto (vitrine, busca, favoritos). */
export const PRODUCT_CARD_INCLUDE = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  images: { orderBy: { position: 'asc' as const }, take: 1 },
  variants: { where: { isActive: true }, select: { stock: true } },
} satisfies Prisma.ProductInclude;

type CardSource = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_CARD_INCLUDE;
}>;

/**
 * US31 — formato único de "cartão de produto". Busca (US10), detalhes (US11),
 * favoritos (US13) e carrinho usam o mesmo id e os mesmos campos.
 */
export function toProductCard(p: CardSource) {
  const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    priceCents: p.priceCents,
    imageUrl: p.images[0]?.url ?? null,
    brand: p.brand,
    category: p.category,
    ratingAvg: Math.round(p.ratingAvg * 10) / 10,
    ratingCount: p.ratingCount,
    inStock: p.isActive && totalStock > 0,
    isActive: p.isActive,
  };
}

export function variantLabel(v: {
  color: string | null;
  size: string | null;
}): string | null {
  const parts = [v.color, v.size ? `Tam. ${v.size}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  }

  listBrands() {
    return this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  }

  /**
   * US10 — busca com filtros combináveis, ordenação e paginação, direto no
   * PostgreSQL. O texto do usuário é normalizado (minúsculo, sem acento) e cada
   * palavra precisa casar por trecho (LIKE) ou por similaridade (pg_trgm, tolera
   * erro de digitação). O índice GIN trigram cobre os dois operadores.
   */
  async search(dto: SearchProductsDto) {
    const started = Date.now();
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const tokens = normalizeSearch(dto.q ?? '')
      .split(' ')
      .filter((t) => t.length > 0)
      .slice(0, 8);
    const sort = dto.sort ?? 'relevance';

    const where: Prisma.Sql[] = [Prisma.sql`p."isActive" = true`];

    for (const token of tokens) {
      const like = `%${escapeLike(token)}%`;
      // Palavras curtas (1–2 letras) não têm trigramas úteis: só trecho literal.
      where.push(
        token.length >= 3
          ? Prisma.sql`(p."searchText" LIKE ${like} OR ${token}::text <% p."searchText")`
          : Prisma.sql`p."searchText" LIKE ${like}`,
      );
    }
    if (dto.categoryIds?.length) {
      where.push(
        Prisma.sql`p."categoryId" IN (${Prisma.join(dto.categoryIds)})`,
      );
    }
    if (dto.brandIds?.length) {
      where.push(Prisma.sql`p."brandId" IN (${Prisma.join(dto.brandIds)})`);
    }
    if (dto.minPrice !== undefined) {
      where.push(Prisma.sql`p."priceCents" >= ${dto.minPrice}`);
    }
    if (dto.maxPrice !== undefined) {
      where.push(Prisma.sql`p."priceCents" <= ${dto.maxPrice}`);
    }
    const inStockExpr = Prisma.sql`EXISTS (
      SELECT 1 FROM "ProductVariant" v
      WHERE v."productId" = p.id AND v."isActive" = true AND v.stock > 0
    )`;
    if (dto.inStock) {
      where.push(inStockExpr);
    }
    const whereSql = Prisma.join(where, ' AND ');

    // Pontuação de relevância: similaridade por palavra + bônus quando o nome
    // começa com o termo buscado. Sem termo, relevância = em estoque e melhor avaliado.
    const fullQuery = tokens.join(' ');
    const scoreSql = tokens.length
      ? Prisma.sql`(
          ${Prisma.join(
            tokens.map(
              (t) => Prisma.sql`word_similarity(${t}::text, p."searchText")`,
            ),
            ' + ',
          )}
          + CASE WHEN p."searchText" LIKE ${`${escapeLike(fullQuery)}%`} THEN 1 ELSE 0 END
        )`
      : Prisma.sql`0`;

    let orderSql: Prisma.Sql;
    switch (sort) {
      case 'price_asc':
        orderSql = Prisma.sql`p."priceCents" ASC, p.id ASC`;
        break;
      case 'price_desc':
        orderSql = Prisma.sql`p."priceCents" DESC, p.id ASC`;
        break;
      case 'newest':
        orderSql = Prisma.sql`p."createdAt" DESC, p.id ASC`;
        break;
      default:
        orderSql = Prisma.sql`score DESC, in_stock DESC, p."ratingAvg" DESC, p."ratingCount" DESC, p."createdAt" DESC, p.id ASC`;
    }

    const offset = (page - 1) * pageSize;
    // Limiar de similaridade um pouco mais tolerante que o padrão (0.6) para
    // aceitar erros de digitação comuns ("mochla" -> "mochila"). SET LOCAL vale
    // só dentro desta transação.
    const [, rows, countRows] = await this.prisma.$transaction([
      this.prisma
        .$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.5`,
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p.id, ${scoreSql} AS score, ${inStockExpr} AS in_stock
        FROM "Product" p
        WHERE ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total FROM "Product" p WHERE ${whereSql}
      `),
    ]);

    const ids = rows.map((r) => r.id);
    const products = ids.length
      ? await this.prisma.product.findMany({
          where: { id: { in: ids } },
          include: PRODUCT_CARD_INCLUDE,
        })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((p): p is CardSource => Boolean(p))
      .map(toProductCard);

    const total = Number(countRows[0]?.total ?? 0);
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sort,
      tookMs: Date.now() - started,
    };
  }

  private async findByIdOrSlug(idOrSlug: string) {
    const where = UUID_RE.test(idOrSlug)
      ? { id: idOrSlug }
      : { slug: idOrSlug };
    const product = await this.prisma.product.findUnique({
      where,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        images: { orderBy: { position: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: [{ color: 'asc' }, { size: 'asc' }],
        },
      },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  /** US11 — página do produto: galeria, ficha técnica, variações e estoque. */
  async detail(idOrSlug: string) {
    const p = await this.findByIdOrSlug(idOrSlug);
    const distribution = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId: p.id },
      _count: { _all: true },
    });
    const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);

    const unique = <T>(values: Array<T | null>) =>
      Array.from(new Set(values.filter((v): v is T => v !== null)));

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      brand: p.brand,
      category: p.category,
      specs: Array.isArray(p.specs) ? p.specs : [],
      images: p.images.map((i) => ({
        id: i.id,
        url: i.url,
        alt: i.alt ?? p.name,
      })),
      isActive: p.isActive,
      inStock: p.isActive && totalStock > 0,
      totalStock: p.isActive ? totalStock : 0,
      colors: unique(
        p.variants.map((v) =>
          v.color ? `${v.color}|${v.colorHex ?? ''}` : null,
        ),
      ).map((c) => {
        const [name, hex] = c.split('|');
        return { name, hex: hex || null };
      }),
      sizes: unique(p.variants.map((v) => v.size)),
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        color: v.color,
        colorHex: v.colorHex,
        size: v.size,
        label: variantLabel(v),
        stock: p.isActive ? v.stock : 0,
        available: p.isActive && v.stock > 0,
      })),
      rating: {
        average: Math.round(p.ratingAvg * 10) / 10,
        count: p.ratingCount,
        distribution: [5, 4, 3, 2, 1].map((stars) => ({
          stars,
          count: distribution.find((d) => d.rating === stars)?._count._all ?? 0,
        })),
      },
    };
  }

  /** US11 — estoque atual por variação (o app consulta periodicamente). */
  async stock(idOrSlug: string) {
    const p = await this.findByIdOrSlug(idOrSlug);
    return {
      productId: p.id,
      totalStock: p.isActive ? p.variants.reduce((s, v) => s + v.stock, 0) : 0,
      variants: p.variants.map((v) => ({
        id: v.id,
        stock: p.isActive ? v.stock : 0,
        available: p.isActive && v.stock > 0,
      })),
      checkedAt: new Date().toISOString(),
    };
  }
}
