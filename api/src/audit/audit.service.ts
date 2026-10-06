import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  listRecent(params: { tableName?: string; limit?: number }) {
    const take = Math.min(Math.max(params.limit ?? 50, 1), 200);
    return this.prisma.auditLog.findMany({
      where: params.tableName ? { tableName: params.tableName } : undefined,
      orderBy: { changedAt: 'desc' },
      take,
    });
  }

  async statsByTable() {
    const rows = await this.prisma.auditLog.groupBy({
      by: ['tableName', 'operation'],
      _count: { _all: true },
      orderBy: { tableName: 'asc' },
    });
    return rows.map((r) => ({
      tableName: r.tableName,
      operation: r.operation,
      count: r._count._all,
    }));
  }

  async waitForAudit(opts: {
    tableName: string;
    operation?: string;
    rowId?: string;
    since: Date;
    timeoutMs?: number;
  }) {
    const timeoutMs = opts.timeoutMs ?? 5000;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const hit = await this.prisma.auditLog.findFirst({
        where: {
          tableName: opts.tableName,
          ...(opts.operation ? { operation: opts.operation } : {}),
          ...(opts.rowId ? { rowId: opts.rowId } : {}),
          changedAt: { gte: opts.since },
        },
        orderBy: { changedAt: 'desc' },
      });
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }
}
