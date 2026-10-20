import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedRequest } from '../common/roles';
import { FavoritesService } from './favorites.service';

@UseGuards(JwtAuthGuard)
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.favorites.list(req.user.id);
  }

  @Get('ids')
  ids(@Req() req: AuthedRequest) {
    return this.favorites.ids(req.user.id);
  }

  @Put(':productId')
  add(
    @Req() req: AuthedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.favorites.add(req.user.id, productId);
  }

  @Delete(':productId')
  remove(
    @Req() req: AuthedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.favorites.remove(req.user.id, productId);
  }
}
