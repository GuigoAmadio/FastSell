import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { CheckoutDto } from '../cart/dto/cart.dto';
import { variantLabel } from '../catalog/catalog.service';
import { isValidCpf } from '../common/validators';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';

/** Status em que a compra conta como "comprou o produto" (US12). */
export const PURCHASED_STATUSES: OrderStatus[] = [
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
];

class StockConflict extends Error {
  constructor(
    readonly variantId: string,
    readonly available: number,
  ) {
    super('stock');
  }
}

/**
 * Checkout mínimo: transforma o carrinho em pedido CONFIRMADO, baixando o
 * estoque de forma atômica. Não há cobrança — pagamento é US18/US19.
 * É a base real de "quem comprou" (US12) e do histórico fiscal (US09).
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly shipping: ShippingService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.name || !user.cpf || !isValidCpf(user.cpf)) {
      throw new BadRequestException({
        code: 'PROFILE_INCOMPLETE',
        message:
          'Complete nome e CPF no perfil para emitir o pedido (dados fiscais).',
      });
    }

    const address = dto.addressId
      ? await this.prisma.address.findFirst({
          where: { id: dto.addressId, userId },
        })
      : await this.prisma.address.findFirst({
          where: { userId },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
    if (!address) {
      throw new BadRequestException({
        code: 'ADDRESS_REQUIRED',
        message: 'Cadastre ou selecione um endereço de entrega',
      });
    }

    const rows = await this.cart.rows(userId);
    if (!rows.length) {
      throw new BadRequestException({
        code: 'EMPTY_CART',
        message: 'Carrinho vazio',
      });
    }
    const view = await this.cart.validate(userId);
    if (!view.ok) {
      throw new ConflictException({
        code: 'CART_HAS_ISSUES',
        message: 'Alguns itens do carrinho não têm estoque suficiente',
        items: view.items.filter((i) => i.issue),
      });
    }

    // Frete: o servidor recota com o CEP do endereço — nunca aceita preço vindo do app.
    let shipping: {
      cents: number;
      carrier: string;
      service: string;
      days: number;
    } | null = null;
    if (dto.shippingServiceId) {
      const quote = await this.shipping.quoteForCart(address.cep, rows);
      const option = quote.options.find(
        (o) => o.serviceId === dto.shippingServiceId,
      );
      if (!option) {
        throw new BadRequestException({
          code: 'SHIPPING_OPTION_UNAVAILABLE',
          message:
            'A opção de frete escolhida não está mais disponível. Calcule novamente.',
        });
      }
      shipping = {
        cents: option.priceCents,
        carrier: option.carrier,
        service: option.service,
        days: option.deliveryDays,
      };
    }

    const subtotal = rows.reduce(
      (s, r) => s + r.variant.product.priceCents * r.quantity,
      0,
    );

    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        for (const row of rows) {
          // Baixa condicional: só decrementa se ainda houver estoque. Duas compras
          // simultâneas da última unidade não conseguem passar as duas.
          const updated = await tx.productVariant.updateMany({
            where: {
              id: row.variantId,
              isActive: true,
              stock: { gte: row.quantity },
              product: { isActive: true },
            },
            data: { stock: { decrement: row.quantity } },
          });
          if (updated.count === 0) {
            const current = await tx.productVariant.findUnique({
              where: { id: row.variantId },
            });
            throw new StockConflict(row.variantId, current?.stock ?? 0);
          }
        }

        const created = await tx.order.create({
          data: {
            userId,
            status: 'CONFIRMED',
            subtotalCents: subtotal,
            shippingCents: shipping?.cents ?? 0,
            totalCents: subtotal + (shipping?.cents ?? 0),
            shippingCarrier: shipping?.carrier,
            shippingService: shipping?.service,
            shippingDays: shipping?.days,
            buyerName: user.name!,
            buyerCpf: user.cpf!,
            buyerEmail: user.email,
            shippingAddress: {
              label: address.label,
              cep: address.cep,
              street: address.street,
              number: address.number,
              complement: address.complement,
              neighborhood: address.neighborhood,
              city: address.city,
              state: address.state,
            },
            items: {
              create: rows.map((r) => ({
                productId: r.variant.productId,
                variantId: r.variantId,
                productName: r.variant.product.name,
                variantLabel: variantLabel(r.variant),
                sku: r.variant.sku,
                unitPriceCents: r.variant.product.priceCents,
                quantity: r.quantity,
                subtotalCents: r.variant.product.priceCents * r.quantity,
              })),
            },
          },
          include: { items: true },
        });
        await tx.cartItem.deleteMany({ where: { userId } });
        return created;
      });
    } catch (e) {
      if (e instanceof StockConflict) {
        throw new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          message:
            'O estoque mudou enquanto você finalizava. Revise o carrinho.',
          variantId: e.variantId,
          available: e.available,
        });
      }
      throw e;
    }

    // Aviso de pedido passa pelas preferências do usuário (US08); falha de envio
    // não desfaz a compra.
    try {
      await this.notifications.dispatch(userId, 'ORDERS', {
        title: `Pedido #${order.number} confirmado`,
        text: `Recebemos seu pedido #${order.number}.`,
        html: this.mail.orderConfirmedHtml(user.name, order),
      });
    } catch (err) {
      this.logger.error(
        `Falha ao notificar pedido ${order.id}: ${(err as Error).message}`,
      );
    }

    return this.detail(userId, order.id);
  }

  async list(userId: string, page = 1, pageSize = 10) {
    const take = Math.min(Math.max(pageSize, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          items: { select: { id: true, productName: true, quantity: true } },
        },
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return {
      items: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        totalCents: o.totalCents,
        createdAt: o.createdAt,
        itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
        firstItemName: o.items[0]?.productName ?? null,
      })),
      page: Math.max(page, 1),
      pageSize: take,
      total,
    };
  }

  async detail(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            review: { select: { id: true, rating: true } },
            product: {
              select: {
                isActive: true,
                images: { orderBy: { position: 'asc' }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    const reviewable = PURCHASED_STATUSES.includes(order.status);
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      shipping: order.shippingCarrier
        ? {
            carrier: order.shippingCarrier,
            service: order.shippingService,
            deliveryDays: order.shippingDays,
          }
        : null,
      shippingAddress: order.shippingAddress as Prisma.JsonObject,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        variantLabel: i.variantLabel,
        sku: i.sku,
        imageUrl: i.product.images[0]?.url ?? null,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        subtotalCents: i.subtotalCents,
        review: i.review,
        canReview: reviewable && !i.review,
      })),
    };
  }
}
