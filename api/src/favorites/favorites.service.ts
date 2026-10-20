import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PRODUCT_CARD_INCLUDE,
  toProductCard,
} from '../catalog/catalog.service';

/** US13 — lista de desejos ligada ao usuário e ao id estável do produto (US31). */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: PRODUCT_CARD_INCLUDE } },
    });
    return {
      items: favorites.map((f) => ({
        favoritedAt: f.createdAt,
        product: toProductCard(f.product),
      })),
    };
  }

  /** Só os ids: o app usa para pintar o coração em qualquer lista de produtos. */
  async ids(userId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { productId: true },
    });
    return { productIds: rows.map((r) => r.productId) };
  }

  /** Idempotente: favoritar duas vezes não duplica nem dá erro. */
  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Produto não encontrado');
    }
    try {
      await this.prisma.favorite.upsert({
        where: { userId_productId: { userId, productId } },
        create: { userId, productId },
        update: {},
      });
    } catch (e) {
      // Dois toques simultâneos: o segundo bate na chave única — o estado final é o mesmo.
      if (!(
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      ))
        throw e;
    }
    return { productId, isFavorite: true };
  }

  /** Idempotente: remover algo que não está na lista apenas confirma o estado. */
  async remove(userId: string, productId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, productId } });
    return { productId, isFavorite: false };
  }
}
