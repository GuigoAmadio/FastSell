import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** "a,b" ou ["a","b"] -> ["a","b"] (query string aceita as duas formas). */
const toList = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((v) => String(v).trim()).filter(Boolean);
  });

const toBool = () =>
  Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true) return true;
    if (value === 'false' || value === '0' || value === false) return false;
    return value;
  });

export const SORT_OPTIONS = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

/** US10 — parâmetros da busca. Todos os filtros podem ser combinados. */
export class SearchProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @toList()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @toList()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  brandIds?: string[];

  /** Preço mínimo em centavos. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  /** Preço máximo em centavos. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @toBool()
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort?: SortOption;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class SpecDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  value!: string;
}

export class VariantInputDto {
  @IsString()
  @Matches(/^[A-Z0-9-]{3,40}$/, {
    message: 'SKU: 3 a 40 caracteres, letras maiúsculas, números e hífen',
  })
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'colorHex deve ser #RRGGBB' })
  colorHex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  size?: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  colorHex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  size?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceCents!: number;

  @IsUUID('4')
  categoryId!: string;

  @IsUUID('4')
  brandId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SpecDto)
  specs?: SpecDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30_000)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  lengthCm?: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceCents?: number;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SpecDto)
  specs?: SpecDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30_000)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  lengthCm?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class NamedEntityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}

export class ImageMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  alt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  position?: number;
}
