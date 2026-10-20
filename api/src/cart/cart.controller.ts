import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedRequest } from '../common/roles';
import { ShippingService } from '../shipping/shipping.service';
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  ShippingQuoteDto,
  UpdateCartItemDto,
} from './dto/cart.dto';

@UseGuards(JwtAuthGuard)
@Controller('me/cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly shipping: ShippingService,
  ) {}

  @Get()
  get(@Req() req: AuthedRequest) {
    return this.cart.get(req.user.id);
  }

  @Post('items')
  add(@Req() req: AuthedRequest, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(req.user.id, dto.variantId, dto.quantity);
  }

  @Patch('items/:itemId')
  update(
    @Req() req: AuthedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateQuantity(req.user.id, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  remove(
    @Req() req: AuthedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.cart.removeItem(req.user.id, itemId);
  }

  @Post('validate')
  validate(@Req() req: AuthedRequest) {
    return this.cart.validate(req.user.id);
  }

  /** US15 — simulação de frete para o CEP informado, com os itens do carrinho. */
  @Post('shipping-quote')
  async quote(@Req() req: AuthedRequest, @Body() dto: ShippingQuoteDto) {
    const rows = await this.cart.rows(req.user.id);
    return this.shipping.quoteForCart(dto.cep, rows);
  }
}
