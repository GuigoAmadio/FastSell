import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { memoryStorage } from 'multer';
import { join, normalize } from 'path';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/jpg'];

export function uploadsRoot(): string {
  return join(process.cwd(), 'uploads');
}

/**
 * Multer em memória: o arquivo só vai para o disco depois de conferirmos a
 * assinatura binária (não confiamos só no mimetype enviado pelo cliente).
 */
export function imageUploadOptions(maxFiles = 1): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.includes(file.mimetype)) {
        cb(
          new BadRequestException('Apenas imagens PNG ou JPG de até 5MB'),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}

/** Detecta PNG/JPEG pelos primeiros bytes. */
export function detectImageExt(buffer: Buffer): '.png' | '.jpg' | null {
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return '.png';
  }
  if (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return '.jpg';
  }
  return null;
}

/**
 * Valida e grava a imagem em uploads/<folder>/. Retorna a URL pública relativa.
 * `baseName` opcional permite nome estável (ex.: avatar do usuário).
 */
export function saveImage(
  file: Express.Multer.File,
  folder: string,
  baseName?: string,
): string {
  if (!file?.buffer) throw new BadRequestException('Arquivo obrigatório');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new BadRequestException('Imagem maior que 5MB');
  }
  const ext = detectImageExt(file.buffer);
  if (!ext) throw new BadRequestException('Arquivo não é um PNG/JPG válido');

  const dir = join(uploadsRoot(), folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const name = `${baseName ?? `${Date.now()}-${randomBytes(6).toString('hex')}`}${ext}`;
  writeFileSync(join(dir, name), file.buffer);
  return `/uploads/${folder}/${name}`;
}

/** Remove um arquivo salvo por saveImage; ignora URLs externas ou inexistentes. */
export function deleteUpload(url: string | null | undefined): void {
  if (!url || !url.startsWith('/uploads/')) return;
  const root = uploadsRoot();
  const path = normalize(join(root, url.replace(/^\/uploads\//, '')));
  if (!path.startsWith(root)) return;
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // arquivo já removido: nada a fazer
  }
}
