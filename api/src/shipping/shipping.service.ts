import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ShippingPackageItem = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
};

export type ShippingOption = {
  serviceId: string;
  carrier: string;
  service: string;
  priceCents: number;
  /** Prazo em dias úteis, como informado pela transportadora. */
  deliveryDays: number;
  deliveryRange: { min: number; max: number } | null;
  tags: Array<'economic' | 'express'>;
};

export type ShippingQuote = {
  cep: string;
  provider: 'melhor_envio';
  environment: 'sandbox' | 'production';
  options: ShippingOption[];
  economicServiceId: string | null;
  expressServiceId: string | null;
};

type MelhorEnvioService = {
  id: number | string;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  custom_delivery_time?: number;
  delivery_range?: { min: number; max: number };
  custom_delivery_range?: { min: number; max: number };
  company?: { name?: string };
  error?: string;
};

type CartRowLike = {
  quantity: number;
  variant: {
    id: string;
    product: {
      priceCents: number;
      weightGrams: number;
      heightCm: number;
      widthCm: number;
      lengthCm: number;
    };
  };
};

/**
 * US15 — cotação de frete via Melhor Envio (agrega Correios PAC/SEDEX, Jadlog etc.).
 *
 * Sem MELHOR_ENVIO_TOKEN e STORE_ORIGIN_CEP a API responde 503
 * SHIPPING_NOT_CONFIGURED: nenhum valor ou prazo é inventado.
 */
@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  /** Substituível em teste unitário. */
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  constructor(private readonly config: ConfigService) {}

  private settings() {
    const token = this.config.get<string>('MELHOR_ENVIO_TOKEN');
    const origin = (this.config.get<string>('STORE_ORIGIN_CEP') ?? '').replace(
      /\D/g,
      '',
    );
    const environment =
      this.config.get<string>('MELHOR_ENVIO_ENV', 'sandbox') === 'production'
        ? 'production'
        : 'sandbox';
    const baseUrl =
      environment === 'production'
        ? 'https://www.melhorenvio.com.br'
        : 'https://sandbox.melhorenvio.com.br';
    const userAgent = this.config.get<string>(
      'MELHOR_ENVIO_USER_AGENT',
      'FastSell (contato@fastsell.local)',
    );
    return {
      token,
      origin,
      environment: environment as ShippingQuote['environment'],
      baseUrl,
      userAgent,
    };
  }

  get isConfigured(): boolean {
    const s = this.settings();
    return Boolean(s.token && /^\d{8}$/.test(s.origin));
  }

  quoteForCart(cep: string, rows: CartRowLike[]): Promise<ShippingQuote> {
    if (!rows.length) {
      throw new BadRequestException({
        code: 'EMPTY_CART',
        message: 'Carrinho vazio',
      });
    }
    return this.quote(
      cep,
      rows.map((r) => ({
        id: r.variant.id,
        quantity: r.quantity,
        unitPriceCents: r.variant.product.priceCents,
        weightGrams: r.variant.product.weightGrams,
        heightCm: r.variant.product.heightCm,
        widthCm: r.variant.product.widthCm,
        lengthCm: r.variant.product.lengthCm,
      })),
    );
  }

  async quote(
    cep: string,
    items: ShippingPackageItem[],
  ): Promise<ShippingQuote> {
    const destination = cep.replace(/\D/g, '');
    if (!/^\d{8}$/.test(destination) || destination === '00000000') {
      throw new BadRequestException({
        code: 'INVALID_CEP',
        message: 'CEP inválido',
      });
    }
    const s = this.settings();
    if (!this.isConfigured) {
      throw new ServiceUnavailableException({
        code: 'SHIPPING_NOT_CONFIGURED',
        message:
          'Cálculo de frete indisponível: integração com a transportadora não configurada.',
      });
    }

    const body = {
      from: { postal_code: s.origin },
      to: { postal_code: destination },
      products: items.map((i) => ({
        id: i.id,
        width: i.widthCm,
        height: i.heightCm,
        length: i.lengthCm,
        weight: i.weightGrams / 1000,
        insurance_value: i.unitPriceCents / 100,
        quantity: i.quantity,
      })),
      options: { receipt: false, own_hand: false },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${s.baseUrl}/api/v2/me/shipment/calculate`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${s.token}`,
            'User-Agent': s.userAgent,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
    } catch (err) {
      this.logger.error(`Melhor Envio inacessível: ${(err as Error).message}`);
      throw new BadGatewayException({
        code: 'SHIPPING_PROVIDER_ERROR',
        message: 'Não foi possível consultar o frete agora. Tente novamente.',
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      this.logger.error('Melhor Envio recusou o token configurado');
      throw new ServiceUnavailableException({
        code: 'SHIPPING_NOT_CONFIGURED',
        message:
          'Cálculo de frete indisponível: credencial da transportadora inválida.',
      });
    }
    if (response.status === 422) {
      throw new BadRequestException({
        code: 'INVALID_CEP',
        message: 'A transportadora não reconheceu este CEP',
      });
    }
    if (!response.ok) {
      this.logger.error(`Melhor Envio HTTP ${response.status}`);
      throw new BadGatewayException({
        code: 'SHIPPING_PROVIDER_ERROR',
        message: 'Não foi possível consultar o frete agora. Tente novamente.',
      });
    }

    const raw = (await response.json()) as unknown;
    const options = this.mapOptions(
      Array.isArray(raw) ? (raw as MelhorEnvioService[]) : [],
    );
    if (!options.length) {
      throw new BadRequestException({
        code: 'NO_SHIPPING_OPTIONS',
        message: 'Nenhuma transportadora atende este CEP para estes itens',
      });
    }

    return {
      cep: destination,
      provider: 'melhor_envio',
      environment: s.environment,
      options,
      economicServiceId:
        options.find((o) => o.tags.includes('economic'))?.serviceId ?? null,
      expressServiceId:
        options.find((o) => o.tags.includes('express'))?.serviceId ?? null,
    };
  }

  /** Converte a resposta do provedor e marca a opção mais barata e a mais rápida. */
  mapOptions(services: MelhorEnvioService[]): ShippingOption[] {
    const parsed = services
      .filter((svc) => !svc.error)
      .map((svc) => {
        const price = Number(svc.custom_price ?? svc.price);
        const days = Number(svc.custom_delivery_time ?? svc.delivery_time);
        const range = svc.custom_delivery_range ?? svc.delivery_range ?? null;
        return {
          serviceId: String(svc.id),
          carrier: svc.company?.name ?? 'Transportadora',
          service: svc.name ?? String(svc.id),
          priceCents: Math.round(price * 100),
          deliveryDays: days,
          deliveryRange: range ? { min: range.min, max: range.max } : null,
          tags: [] as ShippingOption['tags'],
        };
      })
      .filter(
        (o) =>
          Number.isFinite(o.priceCents) &&
          o.priceCents > 0 &&
          Number.isFinite(o.deliveryDays),
      )
      .sort(
        (a, b) =>
          a.priceCents - b.priceCents || a.deliveryDays - b.deliveryDays,
      );

    if (!parsed.length) return parsed;
    parsed[0].tags.push('economic');
    const fastest = [...parsed].sort(
      (a, b) => a.deliveryDays - b.deliveryDays || a.priceCents - b.priceCents,
    )[0];
    fastest.tags.push('express');
    return parsed;
  }
}
