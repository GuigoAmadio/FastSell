import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminOnly } from '../common/roles';
import { imageUploadOptions } from '../common/uploads';
import { StorageService } from '../storage/storage.service';
import { AdminCatalogService } from './admin-catalog.service';
import {
  CreateProductDto,
  ImageMetaDto,
  NamedEntityDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantInputDto,
} from './dto/catalog.dto';

/** Gestão do catálogo (somente ADMIN). Sem tela no app nesta sprint: uso via API. */
@AdminOnly()
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly admin: AdminCatalogService,
    private readonly storage: StorageService,
  ) {}

  @Post('categories')
  createCategory(@Body() dto: NamedEntityDto) {
    return this.admin.createCategory(dto);
  }

  @Post('brands')
  createBrand(@Body() dto: NamedEntityDto) {
    return this.admin.createBrand(dto);
  }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.admin.createProduct(dto);
  }

  @Get('products')
  listProducts(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const s = status === 'active' || status === 'inactive' ? status : 'all';
    return this.admin.listProducts({
      q: q?.slice(0, 100),
      status: s,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 30,
    });
  }

  @Get('products/:id')
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getAdminProduct(id);
  }

  @Patch('products/:id')
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.admin.updateProduct(id, dto);
  }

  @Delete('products/:id')
  deactivateProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deactivateProduct(id);
  }

  @Post('products/:id/variants')
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VariantInputDto,
  ) {
    return this.admin.addVariant(id, dto);
  }

  @Patch('variants/:variantId')
  updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.admin.updateVariant(variantId, dto);
  }

  @Post('products/:id/images')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions(1)))
  async addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: ImageMetaDto,
  ) {
    if (!file)
      throw new BadRequestException('Arquivo obrigatório (campo "image")');
    const url = await this.storage.save(file, 'products');
    return this.admin.addImage(id, url, meta.alt, meta.position);
  }

  @Delete('products/:id/images/:imageId')
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.admin.removeImage(id, imageId);
  }
}
