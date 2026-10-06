import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService (unit)', () => {
  const prisma = {
    auditLog: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new AuditService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('listRecent limita entre 1 e 200', async () => {
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    await service.listRecent({ limit: 999 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it('statsByTable normaliza contagem', async () => {
    (prisma.auditLog.groupBy as jest.Mock).mockResolvedValue([
      { tableName: 'User', operation: 'INSERT', _count: { _all: 3 } },
    ]);
    const stats = await service.statsByTable();
    expect(stats).toEqual([
      { tableName: 'User', operation: 'INSERT', count: 3 },
    ]);
  });
});
