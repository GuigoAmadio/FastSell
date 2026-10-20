import { Module } from '@nestjs/common';
import { ShippingModule } from '../shipping/shipping.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [ShippingModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
