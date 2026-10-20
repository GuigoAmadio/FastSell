import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { writeSeedImage } from './seed-images';

const prisma = new PrismaClient();

/* Mesma normalização de src/common/text.ts (o seed roda fora do Nest). */
function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const slugify = (v: string) => normalizeSearch(v).replace(/\s+/g, '-');

type SeedVariant = { color?: string; hex?: string; size?: string; stock: number };
type SeedProduct = {
  name: string;
  category: string;
  brand: string;
  priceCents: number;
  description: string;
  specs: Array<{ label: string; value: string }>;
  weightGrams: number;
  dims: [number, number, number]; // altura, largura, comprimento (cm)
  variants: SeedVariant[];
};

/*
 * Catálogo de DEMONSTRAÇÃO. Marcas fictícias; imagens geradas localmente.
 * Nenhum pedido ou avaliação é criado aqui: esses dados só nascem de uso real.
 */
const CATEGORIES = ['Calçados', 'Roupas', 'Acessórios', 'Casa', 'Eletrônicos'];
const BRANDS = ['Aurora', 'Vértice', 'Maré Alta', 'Ponto Norte', 'Lumen', 'Trama'];

const sizesShoes = ['37', '38', '39', '40', '41', '42'];
const sizesClothes = ['P', 'M', 'G', 'GG'];

function grid(colors: Array<[string, string]>, sizes: string[], stock: (i: number) => number) {
  const out: SeedVariant[] = [];
  let i = 0;
  for (const [color, hex] of colors) {
    for (const size of sizes) out.push({ color, hex, size, stock: stock(i++) });
  }
  return out;
}

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Tênis Corrida Leve Ar',
    category: 'Calçados',
    brand: 'Vértice',
    priceCents: 32990,
    description:
      'Tênis de corrida com cabedal em malha respirável e entressola de espuma macia. Pensado para treinos diários de até 15 km.',
    specs: [
      { label: 'Cabedal', value: 'Malha respirável' },
      { label: 'Entressola', value: 'EVA de alta resiliência' },
      { label: 'Drop', value: '8 mm' },
      { label: 'Peso (par, 40)', value: '520 g' },
    ],
    weightGrams: 900,
    dims: [13, 22, 32],
    variants: grid(
      [
        ['Preto', '#1F2328'],
        ['Azul', '#2A5DB0'],
      ],
      sizesShoes,
      (i) => [4, 7, 0, 12, 3, 1, 6, 2, 9, 0, 5, 8][i % 12],
    ),
  },
  {
    name: 'Tênis Casual Lona',
    category: 'Calçados',
    brand: 'Trama',
    priceCents: 17990,
    description: 'Tênis de lona com solado vulcanizado, para o dia a dia. Palmilha removível.',
    specs: [
      { label: 'Cabedal', value: 'Lona de algodão' },
      { label: 'Solado', value: 'Borracha vulcanizada' },
    ],
    weightGrams: 800,
    dims: [12, 20, 30],
    variants: grid(
      [
        ['Branco', '#E9E6DF'],
        ['Verde', '#3E6B4F'],
      ],
      sizesShoes,
      (i) => (i % 5 === 0 ? 0 : 3 + (i % 4)),
    ),
  },
  {
    name: 'Sandália Papete Conforto',
    category: 'Calçados',
    brand: 'Maré Alta',
    priceCents: 12990,
    description: 'Papete com tiras ajustáveis em velcro e palmilha anatômica.',
    specs: [
      { label: 'Material', value: 'Poliéster e EVA' },
      { label: 'Fechamento', value: 'Velcro' },
    ],
    weightGrams: 600,
    dims: [10, 18, 30],
    variants: grid([['Caramelo', '#A8713A']], sizesShoes, (i) => 2 + i),
  },
  {
    name: 'Camiseta Básica Algodão',
    category: 'Roupas',
    brand: 'Trama',
    priceCents: 5990,
    description: 'Camiseta de algodão penteado fio 30.1, modelagem reta e gola careca reforçada.',
    specs: [
      { label: 'Composição', value: '100% algodão' },
      { label: 'Fio', value: '30.1 penteado' },
      { label: 'Modelagem', value: 'Reta' },
    ],
    weightGrams: 250,
    dims: [3, 25, 30],
    variants: grid(
      [
        ['Branco', '#F2F2F0'],
        ['Preto', '#22252A'],
        ['Mescla', '#9DA3A8'],
      ],
      sizesClothes,
      (i) => 10 + (i % 6),
    ),
  },
  {
    name: 'Moletom Canguru Felpado',
    category: 'Roupas',
    brand: 'Ponto Norte',
    priceCents: 18990,
    description: 'Moletom com capuz, bolso canguru e interior felpado. Punhos e barra em ribana.',
    specs: [
      { label: 'Composição', value: '50% algodão, 50% poliéster' },
      { label: 'Gramatura', value: '320 g/m²' },
    ],
    weightGrams: 700,
    dims: [6, 30, 35],
    variants: grid(
      [
        ['Grafite', '#3C4148'],
        ['Vinho', '#6E2632'],
      ],
      sizesClothes,
      (i) => [0, 2, 5, 1, 3, 0, 4, 2][i],
    ),
  },
  {
    name: 'Jaqueta Corta-Vento',
    category: 'Roupas',
    brand: 'Vértice',
    priceCents: 24990,
    description: 'Jaqueta leve com tratamento repelente à água e capuz embutido na gola.',
    specs: [
      { label: 'Tecido', value: 'Poliamida ripstop' },
      { label: 'Repelência', value: 'Garoa leve' },
      { label: 'Bolsos', value: '2 com zíper' },
    ],
    weightGrams: 400,
    dims: [5, 25, 30],
    variants: grid([['Azul-marinho', '#1E2F4F']], sizesClothes, (i) => [3, 6, 4, 1][i]),
  },
  {
    name: 'Calça Jeans Reta',
    category: 'Roupas',
    brand: 'Trama',
    priceCents: 15990,
    description: 'Jeans com elastano para conforto, lavagem média e modelagem reta.',
    specs: [
      { label: 'Composição', value: '98% algodão, 2% elastano' },
      { label: 'Lavagem', value: 'Média' },
    ],
    weightGrams: 650,
    dims: [5, 30, 35],
    variants: grid([['Azul médio', '#4D6C99']], ['38', '40', '42', '44', '46'], (i) => 2 + i),
  },
  {
    name: 'Mochila Urbana 22L',
    category: 'Acessórios',
    brand: 'Ponto Norte',
    priceCents: 21990,
    description: 'Mochila com compartimento acolchoado para notebook de até 15,6", alças ergonômicas e bolso antifurto nas costas.',
    specs: [
      { label: 'Capacidade', value: '22 litros' },
      { label: 'Notebook', value: 'Até 15,6"' },
      { label: 'Material', value: 'Poliéster 600D' },
    ],
    weightGrams: 900,
    dims: [15, 30, 45],
    variants: [
      { color: 'Preto', hex: '#1E2125', stock: 14 },
      { color: 'Cinza', hex: '#6F757C', stock: 6 },
    ],
  },
  {
    name: 'Boné Aba Curva',
    category: 'Acessórios',
    brand: 'Maré Alta',
    priceCents: 7990,
    description: 'Boné de sarja com regulagem traseira em fivela metálica.',
    specs: [
      { label: 'Material', value: 'Sarja de algodão' },
      { label: 'Ajuste', value: 'Fivela' },
    ],
    weightGrams: 150,
    dims: [12, 20, 25],
    variants: [
      { color: 'Bege', hex: '#CDB892', size: 'Único', stock: 9 },
      { color: 'Preto', hex: '#202326', size: 'Único', stock: 0 },
    ],
  },
  {
    name: 'Garrafa Térmica Inox 750ml',
    category: 'Acessórios',
    brand: 'Lumen',
    priceCents: 8990,
    description: 'Garrafa com parede dupla a vácuo: mantém bebidas geladas por 24h e quentes por 12h.',
    specs: [
      { label: 'Capacidade', value: '750 ml' },
      { label: 'Material', value: 'Aço inox 304' },
      { label: 'Térmica', value: '24h fria / 12h quente' },
    ],
    weightGrams: 450,
    dims: [27, 8, 8],
    variants: [
      { color: 'Verde-oliva', hex: '#5E6B3A', stock: 20 },
      { color: 'Areia', hex: '#D7C7A6', stock: 11 },
      { color: 'Preto', hex: '#1C1E21', stock: 3 },
    ],
  },
  {
    name: 'Óculos de Sol Polarizado',
    category: 'Acessórios',
    brand: 'Aurora',
    priceCents: 19990,
    description: 'Armação em acetato e lentes polarizadas com proteção UV400.',
    specs: [
      { label: 'Lentes', value: 'Polarizadas UV400' },
      { label: 'Armação', value: 'Acetato' },
    ],
    weightGrams: 200,
    dims: [6, 8, 16],
    variants: [
      { color: 'Tartaruga', hex: '#6B4A2E', stock: 5 },
      { color: 'Preto', hex: '#151618', stock: 8 },
    ],
  },
  {
    name: 'Luminária de Mesa Articulada',
    category: 'Casa',
    brand: 'Lumen',
    priceCents: 14990,
    description: 'Luminária LED com braço articulado, três temperaturas de cor e regulagem de intensidade por toque.',
    specs: [
      { label: 'Potência', value: '8 W LED' },
      { label: 'Temperatura de cor', value: '3000K / 4500K / 6000K' },
      { label: 'Alimentação', value: 'Bivolt' },
    ],
    weightGrams: 1200,
    dims: [12, 18, 45],
    variants: [
      { color: 'Branco', hex: '#EDEDEA', stock: 7 },
      { color: 'Preto', hex: '#232527', stock: 4 },
    ],
  },
  {
    name: 'Jogo de Toalhas Algodão 4 peças',
    category: 'Casa',
    brand: 'Aurora',
    priceCents: 12990,
    description: 'Duas toalhas de banho e duas de rosto em algodão fio penteado, alta absorção.',
    specs: [
      { label: 'Peças', value: '2 banho + 2 rosto' },
      { label: 'Gramatura', value: '500 g/m²' },
    ],
    weightGrams: 1500,
    dims: [12, 30, 35],
    variants: [
      { color: 'Cinza claro', hex: '#C9CCCF', stock: 10 },
      { color: 'Azul-petróleo', hex: '#24535C', stock: 2 },
    ],
  },
  {
    name: 'Caneca Cerâmica 350ml',
    category: 'Casa',
    brand: 'Trama',
    priceCents: 3990,
    description: 'Caneca de cerâmica esmaltada, pode ir ao micro-ondas e à lava-louças.',
    specs: [
      { label: 'Capacidade', value: '350 ml' },
      { label: 'Material', value: 'Cerâmica' },
    ],
    weightGrams: 400,
    dims: [10, 10, 12],
    variants: [
      { color: 'Terracota', hex: '#B5583A', stock: 25 },
      { color: 'Off-white', hex: '#F1EDE4', stock: 18 },
    ],
  },
  {
    name: 'Fone de Ouvido Bluetooth',
    category: 'Eletrônicos',
    brand: 'Lumen',
    priceCents: 27990,
    description: 'Fone over-ear com cancelamento ativo de ruído e até 30 horas de bateria.',
    specs: [
      { label: 'Conexão', value: 'Bluetooth 5.3' },
      { label: 'Bateria', value: 'Até 30 h' },
      { label: 'Cancelamento de ruído', value: 'Ativo (ANC)' },
    ],
    weightGrams: 600,
    dims: [10, 18, 22],
    variants: [
      { color: 'Preto', hex: '#1A1C1E', stock: 6 },
      { color: 'Prata', hex: '#B9BDC2', stock: 0 },
    ],
  },
  {
    name: 'Carregador Portátil 10.000mAh',
    category: 'Eletrônicos',
    brand: 'Vértice',
    priceCents: 11990,
    description: 'Power bank com saída USB-C de carregamento rápido (20 W) e indicador de carga.',
    specs: [
      { label: 'Capacidade', value: '10.000 mAh' },
      { label: 'Saídas', value: 'USB-C 20 W + USB-A' },
    ],
    weightGrams: 300,
    dims: [3, 7, 14],
    variants: [{ color: 'Grafite', hex: '#3A3E44', stock: 15 }],
  },
  {
    name: 'Caixa de Som Portátil à Prova d’Água',
    category: 'Eletrônicos',
    brand: 'Maré Alta',
    priceCents: 22990,
    description: 'Caixa de som com certificação IPX7, 12 horas de bateria e pareamento estéreo.',
    specs: [
      { label: 'Potência', value: '16 W RMS' },
      { label: 'Proteção', value: 'IPX7' },
      { label: 'Bateria', value: 'Até 12 h' },
    ],
    weightGrams: 700,
    dims: [10, 10, 20],
    variants: [
      { color: 'Azul', hex: '#2F6FA3', stock: 5 },
      { color: 'Laranja', hex: '#D9722B', stock: 3 },
    ],
  },
  {
    name: 'Relógio Digital Esportivo',
    category: 'Acessórios',
    brand: 'Vértice',
    priceCents: 15990,
    description: 'Relógio digital com cronômetro, alarme e resistência à água até 50 metros.',
    specs: [
      { label: 'Resistência à água', value: '5 ATM' },
      { label: 'Funções', value: 'Cronômetro, alarme, luz' },
    ],
    weightGrams: 200,
    dims: [8, 8, 12],
    variants: [{ color: 'Preto', hex: '#191B1D', stock: 0 }],
  },
];

async function seedUsers() {
  const demoHash = await argon2.hash('Senha@123');
  const user = await prisma.user.upsert({
    where: { email: 'demo@fastsell.app' },
    update: {},
    create: {
      email: 'demo@fastsell.app',
      name: 'Cliente Demo',
      passwordHash: demoHash,
      phone: '+5500000000000',
      biometricEnabled: false,
      twoFactorEnabled: false,
    },
  });
  console.log('Seed OK:', user.email, '(senha: Senha@123)');

  // Conta ADMIN de desenvolvimento para o CRUD de catálogo. Troque a senha fora do ambiente local.
  const adminHash = await argon2.hash('Admin@123');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@fastsell.app' },
    update: { role: 'ADMIN' },
    create: {
      email: 'admin@fastsell.app',
      name: 'Administrador',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });
  console.log('Seed OK:', admin.email, '(senha: Admin@123, papel ADMIN)');
}

async function seedCatalog() {
  const categories = new Map<string, string>();
  for (const name of CATEGORIES) {
    const c = await prisma.category.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
    });
    categories.set(name, c.id);
  }
  const brands = new Map<string, string>();
  for (const name of BRANDS) {
    const b = await prisma.brand.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
    });
    brands.set(name, b.id);
  }

  for (const p of PRODUCTS) {
    const slug = slugify(p.name);
    const colors = Array.from(new Set(p.variants.map((v) => v.color).filter(Boolean)));
    const searchText = normalizeSearch([p.name, p.brand, p.category, ...colors].join(' '));
    const base = {
      name: p.name,
      description: p.description,
      searchText,
      priceCents: p.priceCents,
      categoryId: categories.get(p.category)!,
      brandId: brands.get(p.brand)!,
      specs: p.specs,
      weightGrams: p.weightGrams,
      heightCm: p.dims[0],
      widthCm: p.dims[1],
      lengthCm: p.dims[2],
    };
    // update: {} -> rodar o seed de novo não sobrescreve preço/estoque já alterados.
    const product = await prisma.product.upsert({
      where: { slug },
      update: {},
      create: { slug, ...base },
    });

    for (const v of p.variants) {
      const sku = [
        slug.split('-').map((w) => w[0]).join('').toUpperCase(),
        v.color ? slugify(v.color).toUpperCase().slice(0, 4) : 'UN',
        v.size ? slugify(v.size).toUpperCase() : 'U',
      ].join('-');
      await prisma.productVariant.upsert({
        where: { sku },
        update: {},
        create: {
          productId: product.id,
          sku,
          color: v.color,
          colorHex: v.hex,
          size: v.size,
          stock: v.stock,
        },
      });
    }

    const hasImages = await prisma.productImage.count({ where: { productId: product.id } });
    if (!hasImages) {
      const mainHex = p.variants[0].hex ?? '#888888';
      const altHex = p.variants.find((v) => v.hex && v.hex !== mainHex)?.hex ?? mainHex;
      const shots: Array<[string, number, string]> = [
        [mainHex, 0, 'frente'],
        [mainHex, 1, 'detalhe'],
        [altHex, 2, 'lateral'],
      ];
      let position = 0;
      for (const [hex, kind, label] of shots) {
        const url = writeSeedImage(`seed-${slug}-${position}.png`, hex, kind);
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url,
            alt: `${p.name} — ${label} (imagem ilustrativa)`,
            position: position++,
          },
        });
      }
    }
  }
  console.log(`Seed OK: catálogo de demonstração com ${PRODUCTS.length} produtos`);
}

async function main() {
  await seedUsers();
  await seedCatalog();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
