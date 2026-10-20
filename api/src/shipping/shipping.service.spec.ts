import { ConfigService } from '@nestjs/config';
import { ShippingService } from './shipping.service';

/**
 * Testes da integração de frete com o provedor SIMULADO (fetch falso).
 * Servem para validar mapeamento, validação de CEP e tratamento de erros —
 * não comprovam a integração real com o Melhor Envio.
 */
function service(env: Record<string, string | undefined>) {
  const config = {
    get: (k: string, d?: unknown) => env[k] ?? d,
  } as unknown as ConfigService;
  return new ShippingService(config);
}

const item = {
  id: 'v1',
  quantity: 2,
  unitPriceCents: 5990,
  weightGrams: 250,
  heightCm: 3,
  widthCm: 25,
  lengthCm: 30,
};

const configured = {
  MELHOR_ENVIO_TOKEN: 'token-de-teste',
  STORE_ORIGIN_CEP: '13010-000',
  MELHOR_ENVIO_ENV: 'sandbox',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ShippingService (US15)', () => {
  it('sem credenciais responde 503 SHIPPING_NOT_CONFIGURED, sem inventar valores', async () => {
    const s = service({});
    await expect(s.quote('01310100', [item])).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: 'SHIPPING_NOT_CONFIGURED' }),
    });
  });

  it.each(['123', '0131010A', '00000000', ''])(
    'rejeita CEP inválido "%s"',
    async (cep) => {
      const s = service(configured);
      await expect(s.quote(cep, [item])).rejects.toMatchObject({ status: 400 });
    },
  );

  it('monta a requisição no formato do provedor e marca econômico e expresso', async () => {
    const s = service(configured);
    let sentUrl = '';
    let sentBody: any = null;
    let sentHeaders: any = null;
    s.fetchImpl = (async (url: string, init: RequestInit) => {
      sentUrl = url;
      sentBody = JSON.parse(init.body as string);
      sentHeaders = init.headers;
      return jsonResponse(200, [
        {
          id: 1,
          name: 'PAC',
          price: '22.50',
          delivery_time: 8,
          company: { name: 'Correios' },
        },
        {
          id: 2,
          name: 'SEDEX',
          price: '41.90',
          delivery_time: 2,
          company: { name: 'Correios' },
        },
        {
          id: 3,
          name: '.Package',
          price: '25.10',
          delivery_time: 5,
          company: { name: 'Jadlog' },
        },
        { id: 4, name: 'Mini Envios', error: 'Dimensões excedidas' },
      ]);
    }) as unknown as typeof fetch;

    const quote = await s.quote('01310-100', [item]);

    expect(sentUrl).toBe(
      'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate',
    );
    expect(sentHeaders.Authorization).toBe('Bearer token-de-teste');
    expect(sentBody.from.postal_code).toBe('13010000');
    expect(sentBody.to.postal_code).toBe('01310100');
    expect(sentBody.products[0]).toMatchObject({
      weight: 0.25,
      insurance_value: 59.9,
      quantity: 2,
    });

    expect(quote.options.map((o) => o.serviceId)).toEqual(['1', '3', '2']); // por preço; o com erro sai
    expect(quote.economicServiceId).toBe('1');
    expect(quote.expressServiceId).toBe('2');
    expect(quote.options[0]).toMatchObject({
      priceCents: 2250,
      deliveryDays: 8,
      carrier: 'Correios',
    });
  });

  it('falha de rede vira 502 com mensagem amigável', async () => {
    const s = service(configured);
    s.fetchImpl = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    await expect(s.quote('01310100', [item])).rejects.toMatchObject({
      status: 502,
    });
  });

  it('token recusado pelo provedor vira 503 (configuração), não 500', async () => {
    const s = service(configured);
    s.fetchImpl = (async () =>
      jsonResponse(401, {
        message: 'Unauthenticated.',
      })) as unknown as typeof fetch;
    await expect(s.quote('01310100', [item])).rejects.toMatchObject({
      status: 503,
    });
  });

  it('nenhuma opção válida para o CEP vira 400 NO_SHIPPING_OPTIONS', async () => {
    const s = service(configured);
    s.fetchImpl = (async () =>
      jsonResponse(200, [
        { id: 1, name: 'PAC', error: 'CEP não atendido' },
      ])) as unknown as typeof fetch;
    await expect(s.quote('01310100', [item])).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: 'NO_SHIPPING_OPTIONS' }),
    });
  });
});
