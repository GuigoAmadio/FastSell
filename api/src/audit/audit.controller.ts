import { Controller, Get, Query } from '@nestjs/common';
import { AdminOnly } from '../common/roles';
import { AuditService } from './audit.service';

// Auditoria guarda cópias de dados pessoais: leitura restrita a ADMIN.
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @AdminOnly()
  @Get()
  list(@Query('table') tableName?: string, @Query('limit') limit?: string) {
    return this.audit.listRecent({
      tableName,
      limit: limit ? Number(limit) : 50,
    });
  }

  @AdminOnly()
  @Get('stats')
  stats() {
    return this.audit.statsByTable();
  }
}
