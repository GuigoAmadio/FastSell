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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedRequest } from '../common/roles';
import { imageUploadOptions } from '../common/uploads';
import { MAX_REVIEW_PHOTOS, ReviewsService } from './reviews.service';

/** Multipart: campos chegam como texto, por isso o @Type(() => Number). */
export class CreateReviewDto {
  @Type(() => Number)
  @IsInt({ message: 'Nota deve ser um número inteiro de 1 a 5' })
  @Min(1, { message: 'Nota mínima é 1 estrela' })
  @Max(5, { message: 'Nota máxima é 5 estrelas' })
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ) {
    return this.reviews.list(productId, page, pageSize);
  }

  @UseGuards(JwtAuthGuard)
  @Get('eligibility')
  eligibility(
    @Req() req: AuthedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.reviews.eligibility(req.user.id, productId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FilesInterceptor(
      'photos',
      MAX_REVIEW_PHOTOS,
      imageUploadOptions(MAX_REVIEW_PHOTOS),
    ),
  )
  create(
    @Req() req: AuthedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateReviewDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.reviews.create(req.user.id, productId, dto, files ?? []);
  }
}
