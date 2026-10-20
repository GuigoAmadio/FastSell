import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutDto } from '../cart/dto/cart.dto';
import type { AuthedRequest } from '../common/roles';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller('me/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  checkout(@Req() req: AuthedRequest, @Body() dto: CheckoutDto) {
    return this.orders.checkout(req.user.id, dto);
  }

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ) {
    return this.orders.list(req.user.id, page, pageSize);
  }

  @Get(':id')
  detail(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(req.user.id, id);
  }
}
