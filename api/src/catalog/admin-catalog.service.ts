import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { buildSearchText, normalizeSearch, slugify } from '../common/text';
import { StorageService } from '../storage/storage.service';
import {
  CreateProductDto,
  NamedEntityDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantInputDto,
} from './dto/catalog.dto';

/** CRUD de catálogo para usuários com papel ADMIN. */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async createCategory(dto: NamedEntityDto) {
    return this.createNamed('category', dto.name);
  }

  async createBrand(dto: NamedEntityDto) {
    return this.createNamed('brand', dto.name);
  }

  private async createNamed(kind: 'category' | 'brand', name: string) {
    const data = { name: name.trim(), slug: slugify(name) };
    try {
      return kind === 'category'
        ? await this.prisma.category.create({ data })
        : await this.prisma.brand.create({ data });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `${kind === 'category' ? 'Categoria' : 'Marca'} já existe`,
        );
      }
      throw e;
    }
  }

  private async uniqueSlug(name: string, ignoreId?: string): Promise<string> {
    const base = slugify(name) || 'produto';
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const clash = await this.prisma.product.findUnique({ where: { slug } });
      if (!clash || clash.id === ignoreId) return slug;
      slug = `${base}-${randomBytes(3).toString('hex')}`;
    }
    throw new ConflictException('Não foi possível gerar um slug único');
  }

  /** Recalcula o texto de busca (nome, marca, categoria, cores) após qualquer mudança. */
  async refreshSearchText(productId: string) {
    const p = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: {
        brand: true,
        category: true,
        variants: { where: { isActive: true } },
      },
    });
    const colors = Array.from(new Set(p.variants.map((v) => v.color)));
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        searchText: buildSearchText([
          p.name,
          p.brand.name,
          p.category.name,
          ...colors,
        ]),
      },
    });
  }

  private async ensureRefs(categoryId?: string, brandId?: string) {
    if (
      categoryId &&
      !(await this.prisma.category.findUnique({ where: { id: categoryId } }))
    ) {
      throw new BadRequestException('Categoria inexistente');
    }
    if (
      brandId &&
      !(await this.prisma.brand.findUnique({ where: { id: brandId } }))
    ) {
      throw new BadRequestException('Marca inexistente');
    }
  }

  private skuConflict(e: unknown): never {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      throw new ConflictException('SKU já cadastrado');
    }
    throw e;
  }

  async createProduct(dto: CreateProductDto) {
    if (!dto.variants.length) {
      throw new BadRequestException('Cadastre ao menos uma variação (SKU)');
    }
    await this.ensureRefs(dto.categoryId, dto.brandId);
    const slug = await this.uniqueSlug(dto.name);
    try {
      const product = await this.prisma.product.create({
        data: {
          slug,
          name: dto.name.trim(),
          description: dto.description.trim(),
          searchText: '',
          priceCents: dto.priceCents,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          specs: (dto.specs ?? []) as unknown as Prisma.InputJsonValue,
          weightGrams: dto.weightGrams,
          heightCm: dto.heightCm,
          widthCm: dto.widthCm,
          lengthCm: dto.lengthCm,
          variants: { create: dto.variants.map((v) => ({ ...v })) },
        },
      });
      await this.refreshSearchText(product.id);
      return this.getAdminProduct(product.id);
    } catch (e) {
      this.skuConflict(e);
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.ensureExists(id);
    await this.ensureRefs(dto.categoryId, dto.brandId);
    const data: Prisma.ProductUncheckedUpdateInput = {
      ...(dto.name !== undefined
        ? { name: dto.name.trim(), slug: await this.uniqueSlug(dto.name, id) }
        : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.brandId !== undefined ? { brandId: dto.brandId } : {}),
      ...(dto.specs !== undefined
        ? { specs: dto.specs as unknown as Prisma.InputJsonValue }
        : {}),
      ...(dto.weightGrams !== undefined
        ? { weightGrams: dto.weightGrams }
        : {}),
      ...(dto.heightCm !== undefined ? { heightCm: dto.heightCm } : {}),
      ...(dto.widthCm !== undefined ? { widthCm: dto.widthCm } : {}),
      ...(dto.lengthCm !== undefined ? { lengthCm: dto.lengthCm } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };
    await this.prisma.product.update({ where: { id }, data });
    await this.refreshSearchText(id);
    return this.getAdminProduct(id);
  }

  /**
   * "Excluir" produto = desativar. Pedidos e avaliações referenciam o produto,
   * então apagar a linha quebraria o histórico (e o histórico fiscal da US09).
   */
  async deactivateProduct(id: string) {
    await this.ensureExists(id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Produto desativado' };
  }

  async addVariant(productId: string, dto: VariantInputDto) {
    await this.ensureExists(productId);
    try {
      const variant = await this.prisma.productVariant.create({
        data: { ...dto, productId },
      });
      await this.refreshSearchText(productId);
      return variant;
    } catch (e) {
      this.skuConflict(e);
    }
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) throw new NotFoundException('Variação não encontrada');
    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: dto,
    });
    await this.refreshSearchText(variant.productId);
    return updated;
  }

  async addImage(
    productId: string,
    url: string,
    alt?: string,
    position?: number,
  ) {
    await this.ensureExists(productId);
    const count = await this.prisma.productImage.count({
      where: { productId },
    });
    if (count >= 12) {
      await this.storage.remove(url);
      throw new BadRequestException('Limite de 12 imagens por produto');
    }
    return this.prisma.productImage.create({
      data: { productId, url, alt, position: position ?? count },
    });
  }

  async removeImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) throw new NotFoundException('Imagem não encontrada');
    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.storage.remove(image.url);
    return { message: 'Imagem removida' };
  }

  /** Lista do painel: inclui desativados, com estoque total e nº de variações. */
  async listProducts(params: {
    q?: string;
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const take = Math.min(Math.max(params.pageSize ?? 30, 1), 100);
    const term = normalizeSearch(params.q ?? '');
    const where: Prisma.ProductWhereInput = {
      ...(term ? { searchText: { contains: term } } : {}),
      ...(params.status === 'active' ? { isActive: true } : {}),
      ...(params.status === 'inactive' ? { isActive: false } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * take,
        take,
        include: {
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          images: { orderBy: { position: 'asc' }, take: 1 },
          variants: { select: { stock: true, isActive: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        priceCents: p.priceCents,
        isActive: p.isActive,
        brand: p.brand,
        category: p.category,
        imageUrl: p.images[0]?.url ?? null,
        variantsCount: p.variants.length,
        totalStock: p.variants
          .filter((v) => v.isActive)
          .reduce((s, v) => s + v.stock, 0),
        updatedAt: p.updatedAt,
      })),
      page,
      pageSize: take,
      total,
    };
  }

  async getAdminProduct(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        brand: true,
        category: true,
        variants: { orderBy: { sku: 'asc' } },
        images: { orderBy: { position: 'asc' } },
      },
    });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Produto não encontrado');
  }
}
