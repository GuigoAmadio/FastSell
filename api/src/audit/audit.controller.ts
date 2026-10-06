import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Query('table') tableName?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listRecent({
      tableName,
      limit: limit ? Number(limit) : 50,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  stats() {
    return this.audit.statsByTable();
  }
}
