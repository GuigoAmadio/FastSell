import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

/**
 * Gera imagens PNG ilustrativas para o catálogo de demonstração, sem baixar
 * nada da internet e sem usar fotos de terceiros. Cada imagem é um "cartão"
 * com a cor da variação; servem só para o carrossel/zoom ter o que mostrar.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

/** variant: 0 = frente, 1 = detalhe (zoom), 2 = lateral. */
export function renderPng(hex: string, variant: number, size = 720): Buffer {
  const [r, g, b] = hexToRgb(hex);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      // fundo claro neutro com leve degradê
      let pr = mix(246, 232, y / size);
      let pg = mix(247, 234, y / size);
      let pb = mix(249, 238, y / size);

      let inside = false;
      let shade = 0;
      if (variant === 0) {
        const w = size * 0.56;
        const h = size * 0.62;
        const dx = Math.abs(x - cx) - (w / 2 - 40);
        const dy = Math.abs(y - cy) - (h / 2 - 40);
        const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
        inside = dist <= 40;
        shade = (y - (cy - h / 2)) / h;
      } else if (variant === 1) {
        const d = Math.hypot(x - cx, y - cy);
        inside = d <= size * 0.34;
        // listras finas: dão algo para ver quando o usuário dá zoom
        shade = ((Math.floor((x + y) / 14) % 2) * 0.12) + d / (size * 0.34) * 0.25;
      } else {
        const w = size * 0.7;
        const h = size * 0.34;
        inside = Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
        shade = (x - (cx - w / 2)) / w;
      }

      if (inside) {
        const t = Math.min(Math.max(shade, 0), 1) * 0.35;
        pr = mix(r, 0, t);
        pg = mix(g, 0, t);
        pb = mix(b, 0, t);
      }
      const i = row + 1 + x * 3;
      raw[i] = pr;
      raw[i + 1] = pg;
      raw[i + 2] = pb;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function writeSeedImage(fileName: string, hex: string, variant: number): string {
  const dir = join(process.cwd(), 'uploads', 'products');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, fileName);
  if (!existsSync(path)) writeFileSync(path, renderPng(hex, variant));
  return `/uploads/products/${fileName}`;
}
