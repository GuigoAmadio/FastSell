import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Senha@123');

  const user = await prisma.user.upsert({
    where: { email: 'demo@fastsell.app' },
    update: {},
    create: {
      email: 'demo@fastsell.app',
      name: 'Cliente Demo',
      passwordHash,
      phone: '+5500000000000',
      biometricEnabled: false,
      twoFactorEnabled: false,
    },
  });

  console.log('Seed OK:', user.email, '(senha: Senha@123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
