import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { variantLabel } from '../catalog/catalog.service';

export const MAX_QTY_PER_ITEM = 99;

const CART_INCLUDE = {
  variant: {
    include: {
      product: {
        include: { images: { orderBy: { position: 'asc' as const }, take: 1 } },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartRow = Prisma.CartItemGetPayload<{ include: typeof CART_INCLUDE }>;

export type CartIssue =
  'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | null;

/** Erro 409 padronizado: o app mostra o alerta e sugere a quantidade disponível. */
export function insufficientStock(available: number, variantId: string) {
  return new ConflictException({
    code: 'INSUFFICIENT_STOCK',
    message:
      available > 0
        ? `Quantidade indisponível: restam apenas ${available} em estoque`
        : 'Produto sem estoque',
    available,
    variantId,
  });
}

/**
 * US14 — carrinho persistido por usuário. Preço e estoque vêm sempre do catálogo
 * (US31) no momento da leitura; o carrinho guarda só variação + quantidade.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(rows: CartRow[]) {
    const items = rows.map((row) => {
      const { variant } = row;
      const { product } = variant;
      const sellable = product.isActive && variant.isActive;
      const available = sellable ? variant.stock : 0;
      let issue: CartIssue = null;
      if (!sellable) issue = 'UNAVAILABLE';
      else if (available === 0) issue = 'OUT_OF_STOCK';
      else if (row.quantity > available) issue = 'INSUFFICIENT_STOCK';
      return {
        id: row.id,
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantLabel: variantLabel(variant),
        sku: variant.sku,
        imageUrl: product.images[0]?.url ?? null,
        unitPriceCents: product.priceCents,
        quantity: row.quantity,
        subtotalCents: product.priceCents * row.quantity,
        availableStock: available,
        maxQuantity: Math.min(available, MAX_QTY_PER_ITEM),
        issue,
      };
    });
    return {
      items,
      itemsCount: items.reduce((s, i) => s + i.quantity, 0),
      subtotalCents: items.reduce((s, i) => s + i.subtotalCents, 0),
      hasIssues: items.some((i) => i.issue !== null),
    };
  }

  async rows(userId: string) {
    return this.prisma.cartItem.findMany({
      where: { userId },
      include: CART_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(userId: string) {
    return this.toView(await this.rows(userId));
  }

  private async loadVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { isActive: true } } },
    });
    if (!variant) throw new NotFoundException('Variação não encontrada');
    if (!variant.isActive || !variant.product.isActive) {
      throw new ConflictException({
        code: 'UNAVAILABLE',
        message: 'Produto indisponível',
        variantId,
      });
    }
    return variant;
  }

  /** Adiciona (ou soma à quantidade existente) respeitando o estoque real. */
  async addItem(userId: string, variantId: string, quantity: number) {
    const variant = await this.loadVariant(variantId);
    const existing = await this.prisma.cartItem.findUnique({
      where: { userId_variantId: { userId, variantId } },
    });
    const wanted = (existing?.quantity ?? 0) + quantity;
    if (wanted > MAX_QTY_PER_ITEM) {
      throw new ConflictException({
        code: 'MAX_QUANTITY',
        message: `Máximo de ${MAX_QTY_PER_ITEM} unidades por item`,
        available: Math.min(variant.stock, MAX_QTY_PER_ITEM),
        variantId,
      });
    }
    if (wanted > variant.stock)
      throw insufficientStock(variant.stock, variantId);

    await this.prisma.cartItem.upsert({
      where: { userId_variantId: { userId, variantId } },
      create: { userId, variantId, quantity: wanted },
      update: { quantity: wanted },
    });
    return this.get(userId);
  }

  async updateQuantity(userId: string, itemId: string, quantity: number) {
    const item = await this.ensureOwned(userId, itemId);
    const variant = await this.loadVariant(item.variantId);
    if (quantity > variant.stock)
      throw insufficientStock(variant.stock, variant.id);
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
    return this.get(userId);
  }

  async removeItem(userId: string, itemId: string) {
    await this.ensureOwned(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.get(userId);
  }

  /** Validação de estoque antes do checkout (o checkout valida de novo, atomicamente). */
  async validate(userId: string) {
    const view = await this.get(userId);
    return { ok: view.items.length > 0 && !view.hasIssues, ...view };
  }

  private async ensureOwned(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.userId !== userId) {
      throw new NotFoundException('Item não encontrado no carrinho');
    }
    return item;
  }
}
