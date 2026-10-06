const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  const triggers = await p.$queryRawUnsafe(`
    SELECT tgname, relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT tgisinternal
    ORDER BY relname
  `);
  console.log('triggers', triggers);

  const counts = await p.auditLog.groupBy({
    by: ['tableName', 'operation'],
    _count: { _all: true },
  });
  console.log('audit counts', counts);

  const last = await p.auditLog.findMany({
    orderBy: { changedAt: 'desc' },
    take: 5,
    select: { tableName: true, operation: true, rowId: true, changedAt: true },
  });
  console.log('last', last);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
