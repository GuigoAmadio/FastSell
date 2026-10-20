import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { PURCHASED_STATUSES } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_REVIEW_PHOTOS = 3;

/** "Gabriel Magnabosco Camargo" -> "Gabriel C." (nome exibido publicamente). */
export function publicAuthorName(name: string | null): string {
  if (!name?.trim()) return 'Cliente';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
    : parts[0];
}

/** Média ponderada: Σ(estrelas × quantidade) / total, com 1 casa decimal. */
export function weightedAverage(
  distribution: Array<{ rating: number; count: number }>,
) {
  const total = distribution.reduce((s, d) => s + d.count, 0);
  if (!total) return { average: 0, count: 0 };
  const sum = distribution.reduce((s, d) => s + d.rating * d.count, 0);
  return { average: Math.round((sum / total) * 10) / 10, count: total };
}

/**
 * US12 — avaliações vinculadas a um item de pedido real. A permissão é decidida
 * aqui no backend a partir dos pedidos do usuário; o app não consegue forjar.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async ensureProduct(productId: string) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, ratingAvg: true, ratingCount: true },
    });
    if (!p) throw new NotFoundException('Produto não encontrado');
    return p;
  }

  async list(productId: string, page = 1, pageSize = 10) {
    const product = await this.ensureProduct(productId);
    const take = Math.min(Math.max(pageSize, 1), 30);
    const skip = (Math.max(page, 1) - 1) * take;
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { photos: { select: { id: true, url: true } } },
      }),
      this.prisma.review.count({ where: { productId } }),
    ]);
    return {
      average: Math.round(product.ratingAvg * 10) / 10,
      count: product.ratingCount,
      items: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        authorName: r.authorName,
        createdAt: r.createdAt,
        photos: r.photos,
        verifiedPurchase: true,
      })),
      page: Math.max(page, 1),
      pageSize: take,
      total,
    };
  }

  /** Primeiro item comprado deste produto que ainda não foi avaliado. */
  private findReviewableItem(userId: string, productId: string) {
    return this.prisma.orderItem.findFirst({
      where: {
        productId,
        review: null,
        order: { userId, status: { in: PURCHASED_STATUSES } },
      },
      orderBy: { order: { createdAt: 'asc' } },
    });
  }

  async eligibility(userId: string, productId: string) {
    await this.ensureProduct(productId);
    const item = await this.findReviewableItem(userId, productId);
    if (item) return { canReview: true, reason: null, orderItemId: item.id };
    const purchased = await this.prisma.orderItem.count({
      where: {
        productId,
        order: { userId, status: { in: PURCHASED_STATUSES } },
      },
    });
    return {
      canReview: false,
      reason: purchased ? 'ALREADY_REVIEWED' : 'NOT_PURCHASED',
      orderItemId: null,
    };
  }

  async create(
    userId: string,
    productId: string,
    input: { rating: number; comment?: string },
    files: Express.Multer.File[],
  ) {
    await this.ensureProduct(productId);
    const item = await this.findReviewableItem(userId, productId);
    if (!item) {
      const { reason } = await this.eligibility(userId, productId);
      if (reason === 'ALREADY_REVIEWED') {
        throw new ConflictException({
          code: 'ALREADY_REVIEWED',
          message: 'Você já avaliou todas as compras deste produto',
        });
      }
      throw new ForbiddenException({
        code: 'NOT_PURCHASED',
        message: 'Só quem comprou o produto pode avaliá-lo',
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    // Fotos só vão para o disco depois de a compra ser confirmada.
    const urls: string[] = [];
    try {
      for (const file of files.slice(0, MAX_REVIEW_PHOTOS)) {
        urls.push(await this.storage.save(file, 'reviews'));
      }

      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            productId,
            orderItemId: item.id,
            userId,
            rating: input.rating,
            comment: input.comment?.trim() || null,
            authorName: publicAuthorName(user.name),
            photos: { create: urls.map((url) => ({ url })) },
          },
          include: { photos: { select: { id: true, url: true } } },
        });
        await this.recalculate(tx, productId);
        return review;
      });
    } catch (e) {
      await Promise.all(urls.map((u) => this.storage.remove(u)));
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ALREADY_REVIEWED',
          message: 'Esta compra já foi avaliada',
        });
      }
      throw e;
    }
  }

  /** Recalcula a média do produto a partir de todas as avaliações (fonte de verdade). */
  async recalculate(tx: Prisma.TransactionClient, productId: string) {
    const groups = await tx.review.groupBy({
      by: ['rating'],
      where: { productId },
      _count: { _all: true },
    });
    const { average, count } = weightedAverage(
      groups.map((g) => ({ rating: g.rating, count: g._count._all })),
    );
    await tx.product.update({
      where: { id: productId },
      data: { ratingAvg: average, ratingCount: count },
    });
  }
}
