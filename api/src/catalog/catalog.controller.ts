import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { SearchProductsDto } from './dto/catalog.dto';

/** Rotas públicas do catálogo (não exigem login). */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @Get('brands')
  brands() {
    return this.catalog.listBrands();
  }

  @Get('products')
  search(@Query() dto: SearchProductsDto) {
    return this.catalog.search(dto);
  }

  @Get('products/:idOrSlug')
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.catalog.detail(idOrSlug);
  }

  @Get('products/:idOrSlug/stock')
  @Header('Cache-Control', 'no-store')
  stock(@Param('idOrSlug') idOrSlug: string) {
    return this.catalog.stock(idOrSlug);
  }
}
