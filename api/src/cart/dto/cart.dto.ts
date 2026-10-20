import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MAX_QTY_PER_ITEM } from '../cart.service';

export class AddCartItemDto {
  @IsUUID('4')
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_QTY_PER_ITEM)
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt({ message: 'Quantidade deve ser um número inteiro' })
  @Min(1, { message: 'Quantidade mínima é 1 (para tirar o item, use remover)' })
  @Max(MAX_QTY_PER_ITEM, {
    message: `Máximo de ${MAX_QTY_PER_ITEM} unidades por item`,
  })
  quantity!: number;
}

/** CEP aceita "13010-000" ou "13010000". */
export class ShippingQuoteDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @Matches(/^(?!00000000)\d{8}$/, {
    message: 'CEP inválido: informe 8 dígitos',
  })
  cep!: string;
}

export class CheckoutDto {
  @IsOptional()
  @IsUUID('4')
  addressId?: string;

  /** Id do serviço retornado na cotação; o servidor recota para não confiar no preço do cliente. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,40}$/)
  shippingServiceId?: string;
}
