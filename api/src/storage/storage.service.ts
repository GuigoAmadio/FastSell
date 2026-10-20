import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import {
  deleteUpload,
  detectImageExt,
  MAX_IMAGE_BYTES,
  saveImage,
} from '../common/uploads';

type S3Settings = {
  bucket: string;
  publicBaseUrl: string;
  client: S3Client;
};

/**
 * US06 (e reaproveitado em produtos e avaliações) — onde as imagens ficam.
 *
 * STORAGE_DRIVER=local (padrão): pasta api/uploads, servida pela própria API.
 * STORAGE_DRIVER=s3: bucket S3 ou compatível (AWS, Cloudflare R2, MinIO…).
 * O banco guarda sempre a URL pública; o app não precisa saber qual driver está ativo.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Settings | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get<string>('STORAGE_DRIVER', 'local') !== 's3') return;

    const bucket = this.config.get<string>('S3_BUCKET');
    const region = this.config.get<string>('S3_REGION', 'us-east-1');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    const endpoint = this.config.get<string>('S3_ENDPOINT') || undefined;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'STORAGE_DRIVER=s3 exige S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY',
      );
    }
    const publicBaseUrl = (
      this.config.get<string>('S3_PUBLIC_URL') ||
      (endpoint
        ? `${endpoint.replace(/\/$/, '')}/${bucket}`
        : `https://${bucket}.s3.${region}.amazonaws.com`)
    ).replace(/\/$/, '');

    this.s3 = {
      bucket,
      publicBaseUrl,
      client: new S3Client({
        region,
        endpoint,
        // Provedores compatíveis (MinIO etc.) usam endereço no formato /bucket/chave.
        forcePathStyle: Boolean(endpoint),
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
    this.logger.log(`Imagens no bucket S3 "${bucket}" (${publicBaseUrl})`);
  }

  get driver(): 'local' | 's3' {
    return this.s3 ? 's3' : 'local';
  }

  /** Valida PNG/JPG (assinatura + 5MB) e grava. Retorna a URL pública. */
  async save(
    file: Express.Multer.File,
    folder: string,
    baseName?: string,
  ): Promise<string> {
    if (!this.s3) return saveImage(file, folder, baseName);

    if (!file?.buffer) throw new BadRequestException('Arquivo obrigatório');
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Imagem maior que 5MB');
    }
    const ext = detectImageExt(file.buffer);
    if (!ext) {
      throw new BadRequestException('Arquivo não é um PNG/JPG válido');
    }
    const key = `${folder}/${baseName ?? `${Date.now()}-${randomBytes(6).toString('hex')}`}${ext}`;
    await this.s3.client.send(
      new PutObjectCommand({
        Bucket: this.s3.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: ext === '.png' ? 'image/png' : 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.s3.publicBaseUrl}/${key}`;
  }

  /** Remove uma imagem salva por save(). URLs de outra origem são ignoradas. */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url) return;
    if (url.startsWith('/uploads/')) {
      deleteUpload(url);
      return;
    }
    if (!this.s3 || !url.startsWith(`${this.s3.publicBaseUrl}/`)) return;
    const key = url.slice(this.s3.publicBaseUrl.length + 1);
    try {
      await this.s3.client.send(
        new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: key }),
      );
    } catch (err) {
      // Falha ao apagar arquivo antigo não deve quebrar a operação do usuário.
      this.logger.warn(
        `Não foi possível remover ${key}: ${(err as Error).message}`,
      );
    }
  }
}
